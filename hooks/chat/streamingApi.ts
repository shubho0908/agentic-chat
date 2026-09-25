import { DegradedContextSource, type ApprovalStreamConfig, type HumanInTheLoopRequestEvent, type MemoryStatus, type StreamConfig } from "@/types/chat";
import { ArtifactEventType, type ArtifactEvent } from "@/types/artifact";
import type { ToolArgs } from "@/lib/schemas/chat";
import { apiRoutes } from "@/lib/routes";
import { logger } from "@/lib/logger";
import { HumanInTheLoopRequestKind } from "@/lib/tools/constants";
import { HUMAN_IN_THE_LOOP_REQUEST_TYPE } from "@/lib/orchestrator/constants";

function isAbortError(error: unknown): boolean {
  return (
    error instanceof DOMException && error.name === "AbortError"
  ) || (
    error instanceof Error && error.name === "AbortError"
  );
}

/**
 * Longest silence tolerated on a chat stream before the client gives up. The
 * server emits an SSE heartbeat comment every few seconds while a stream is
 * open, so a gap this long means the backend is gone, not thinking. Without
 * this watchdog any backend stall (lock wait, model hang, tool hang) left the
 * UI processing forever.
 */
export const CHAT_STREAM_STALL_TIMEOUT_MS = 65_000;

export interface ChatStreamReadOptions {
  /** Overrides the stall watchdog window; mainly for tests. */
  stallTimeoutMs?: number;
}

export function createStreamStallError(): Error {
  const error = new Error(
    "The response stopped arriving from the server. Please try again.",
  );
  error.name = "ChatStreamStallError";
  return error;
}

async function readWithStallTimeout(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  stallTimeoutMs: number,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  if (!(stallTimeoutMs > 0)) {
    return reader.read();
  }

  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await new Promise((resolve, reject) => {
      timer = setTimeout(() => {
        timer = null;
        void reader.cancel().catch((cancelError) => {
          if (!isAbortError(cancelError)) {
            logger.warn("Failed to cancel stalled chat stream reader:", cancelError);
          }
        });
        reject(createStreamStallError());
      }, stallTimeoutMs);
      reader.read().then(resolve, reject);
    });
  } finally {
    if (timer !== null) {
      clearTimeout(timer);
    }
  }
}

type StreamCallbacks = Pick<
  StreamConfig,
  | "onChunk"
  | "onMemoryStatus"
  | "onToolCall"
  | "onToolResult"
  | "onToolProgress"
  | "onHumanInTheLoopRequest"
  | "onUsageUpdated"
  | "onThinking"
  | "onArtifact"
  | "onResponseIncomplete"
>;

async function assertOkResponse(response: Response): Promise<void> {
  if (!response.ok) {
    let errorMessage = 'Failed to send message';
    try {
      const errorData = await response.json();
      errorMessage = errorData.error || errorMessage;
    } catch {
      errorMessage = response.statusText || errorMessage;
    }
    throw new Error(errorMessage);
  }
}

function normalizeHumanInTheLoopRequest(parsed: Record<string, unknown>): HumanInTheLoopRequestEvent {
  return {
    type: "hitl_request",
    requestKind: parsed.requestKind === HumanInTheLoopRequestKind.ASK_USER ? HumanInTheLoopRequestKind.ASK_USER : HumanInTheLoopRequestKind.APPROVAL,
    requestId: typeof parsed.requestId === "string" ? parsed.requestId : undefined,
    threadId: typeof parsed.threadId === "string" ? parsed.threadId : undefined,
    toolCallId: typeof parsed.toolCallId === "string" ? parsed.toolCallId : undefined,
    question: typeof parsed.question === "string" ? parsed.question : undefined,
    reason: typeof parsed.reason === "string" ? parsed.reason : undefined,
    title: typeof parsed.title === "string" ? parsed.title : undefined,
    context: typeof parsed.context === "string" ? parsed.context : undefined,
    options: Array.isArray(parsed.options)
      ? parsed.options
          .filter((o): o is Record<string, unknown> => !!o && typeof o === "object")
          .map((o) => ({
            label: typeof o.label === "string" ? o.label : "",
            description: typeof o.description === "string" ? o.description : "",
          }))
      : undefined,
    recommendation: typeof parsed.recommendation === "string" ? parsed.recommendation : undefined,
    toolCalls: Array.isArray(parsed.toolCalls)
      ? parsed.toolCalls
          .filter((toolCall): toolCall is Record<string, unknown> => !!toolCall && typeof toolCall === "object")
          .map((toolCall) => ({
            id: typeof toolCall.id === "string" ? toolCall.id : undefined,
            name: typeof toolCall.name === "string" ? toolCall.name : "unknown_tool",
            args: toolCall.args && typeof toolCall.args === "object" && !Array.isArray(toolCall.args)
              ? toolCall.args as Record<string, unknown>
              : undefined,
          }))
      : undefined,
  };
}

export async function readChatStream(response: Response, callbacks: StreamCallbacks, options: ChatStreamReadOptions = {}): Promise<string> {
  await assertOkResponse(response);
  const reader = response.body?.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: false });

  if (!reader) {
    throw new Error("No response stream available");
  }

  const contentParts: string[] = [];
  let buffer = "";
  const {
    onChunk,
    onMemoryStatus,
    onToolCall,
    onToolResult,
    onToolProgress,
    onHumanInTheLoopRequest,
    onUsageUpdated,
    onThinking,
    onArtifact,
    onResponseIncomplete,
  } = callbacks;
  let receivedDone = false;

  function optionalString(value: unknown): string | undefined {
    return typeof value === "string" ? value : undefined;
  }

  function optionalNumber(value: unknown): number | undefined {
    return typeof value === "number" ? value : undefined;
  }

  function optionalBoolean(value: unknown): boolean | undefined {
    return typeof value === "boolean" ? value : undefined;
  }

  function optionalRecord(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : undefined;
  }

  const DEGRADED_SOURCES = new Set<string>(Object.values(DegradedContextSource));

  function optionalDegradedContexts(value: unknown): MemoryStatus["degradedContexts"] {
    if (!Array.isArray(value)) return undefined;
    const parsed = value.flatMap((entry) => {
      const record = optionalRecord(entry);
      if (!record) return [];
      const { source, reason } = record;
      if (typeof source !== "string" || !DEGRADED_SOURCES.has(source)) return [];
      if (typeof reason !== "string") return [];
      return [{ source: source as DegradedContextSource, reason }];
    });
    return parsed.length > 0 ? parsed : undefined;
  }

  function processParsedEvent(parsed: Record<string, unknown>): void {
    if (parsed.error) {
      throw new Error(typeof parsed.error === "string" ? parsed.error : "Stream error");
    }

    const parsedType = optionalString(parsed.type);

    if (parsedType === 'memory_status' && onMemoryStatus) {
      onMemoryStatus({
        hasMemories: optionalBoolean(parsed.hasMemories) ?? false,
        attemptedMemory: optionalBoolean(parsed.attemptedMemory),
        hasDocuments: optionalBoolean(parsed.hasDocuments) ?? false,
        memoryCount: optionalNumber(parsed.memoryCount) ?? 0,
        documentCount: optionalNumber(parsed.documentCount) ?? 0,
        documentContextState: parsed.documentContextState === "ready" || parsed.documentContextState === "unavailable" ? parsed.documentContextState : undefined,
        documentEvidenceIds: Array.isArray(parsed.documentEvidenceIds) ? parsed.documentEvidenceIds.filter((id): id is string => typeof id === "string") : undefined,
        documentEvidenceFiles: Array.isArray(parsed.documentEvidenceFiles) ? parsed.documentEvidenceFiles.flatMap((entry) => {
          const record = optionalRecord(entry);
          return record && typeof record.id === "string" && typeof record.fileUrl === "string" ? [{ id: record.id, fileUrl: record.fileUrl }] : [];
        }) : undefined,
        hasImages: optionalBoolean(parsed.hasImages) ?? false,
        imageCount: optionalNumber(parsed.imageCount) ?? 0,
        routingDecision: optionalString(parsed.routingDecision) as MemoryStatus["routingDecision"],
        skippedMemory: optionalBoolean(parsed.skippedMemory),
        activeToolName: optionalString(parsed.activeToolName),
        degradedContexts: optionalDegradedContexts(parsed.degradedContexts),
        tokenUsage: optionalRecord(parsed.tokenUsage) as MemoryStatus["tokenUsage"],
      });
    }

    if (parsedType === 'thinking' && onThinking) {
      const delta = typeof parsed.content === "string" ? parsed.content : '';
      onThinking(delta);
    }

    if (parsedType === 'tool_call' && onToolCall) {
      onToolCall({
        toolName: optionalString(parsed.toolName) ?? "unknown_tool",
        toolCallId: optionalString(parsed.toolCallId) ?? "unknown-tool-call",
        args: (optionalRecord(parsed.args) ?? {}) as ToolArgs,
      });
    }

    if (parsedType === 'tool_result' && onToolResult) {
      onToolResult({
        toolName: optionalString(parsed.toolName) ?? "unknown_tool",
        toolCallId: optionalString(parsed.toolCallId) ?? "unknown-tool-call",
        result: typeof parsed.result === "string" || Array.isArray(parsed.result) || optionalRecord(parsed.result)
          ? parsed.result as string | Record<string, unknown> | unknown[]
          : "",
      });
    }

    if (parsedType === 'tool_progress' && onToolProgress) {
      onToolProgress({
        toolName: optionalString(parsed.toolName) ?? "unknown_tool",
        status: optionalString(parsed.status) ?? "running",
        message: optionalString(parsed.message) ?? "",
        details: optionalRecord(parsed.details),
      });
    }

    if ((parsedType === 'hitl_request' || parsedType === HUMAN_IN_THE_LOOP_REQUEST_TYPE) && onHumanInTheLoopRequest) {
      onHumanInTheLoopRequest(normalizeHumanInTheLoopRequest(parsed));
    }

    if (parsedType === 'usage_updated' && onUsageUpdated) {
      onUsageUpdated({
        usageCount: optionalNumber(parsed.usageCount) ?? 0,
        remaining: optionalNumber(parsed.remaining) ?? 0,
        limit: optionalNumber(parsed.limit) ?? 0,
      });
    }

    if (parsedType === 'response_incomplete' && parsed.reason === 'length') {
      onResponseIncomplete?.('length');
    }

    if ((parsedType === ArtifactEventType.START || parsedType === ArtifactEventType.CHUNK || parsedType === ArtifactEventType.END) && onArtifact) {
      onArtifact(parsed as unknown as ArtifactEvent);
    }

    if (typeof parsed.content === "string" && parsed.content && !parsedType) {
      contentParts.push(parsed.content);
      onChunk(parsed.content);
    }
  }

  const SSE_DATA_PREFIX = "data:";
  const stallTimeoutMs = options.stallTimeoutMs ?? CHAT_STREAM_STALL_TIMEOUT_MS;
  try {
    for (;;) {
      const { done, value } = await readWithStallTimeout(reader, stallTimeoutMs);
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      buffer += chunk;

      let newlineIdx: number;
      while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newlineIdx);
        buffer = buffer.slice(newlineIdx + 1);

        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith(SSE_DATA_PREFIX)) continue;

        const data = trimmed.slice(SSE_DATA_PREFIX.length).trim();
        if (data === '[DONE]') {
          receivedDone = true;
          continue;
        }

        try {
          processParsedEvent(JSON.parse(data));
        } catch (err) {
          if (!(err instanceof SyntaxError)) throw err;
          logger.warn('Failed to parse SSE data:', data, err);
        }
      }
    }

    const trailing = buffer.trim();
    if (trailing.startsWith(SSE_DATA_PREFIX)) {
      const data = trailing.slice(SSE_DATA_PREFIX.length).trim();
      if (data === '[DONE]') {
        receivedDone = true;
      } else {
        try {
          processParsedEvent(JSON.parse(data));
        } catch (err) {
          if (!(err instanceof SyntaxError)) throw err;
          logger.warn('Failed to parse final SSE data:', data, err);
        }
      }
    }
  } catch (error) {
    void reader.cancel().catch((cancelError) => {
      if (!isAbortError(cancelError)) {
        logger.warn("Failed to cancel chat stream reader:", cancelError);
      }
    });
    throw error;
  }

  if (!receivedDone) {
    throw new Error('The response stream ended before completion.');
  }

  return contentParts.join('');
}

export async function streamChatCompletion(config: StreamConfig): Promise<string> {
  const { messages, model, signal, conversationId, branchId, reasoningEffort } = config;

  const requestPayload: Record<string, unknown> = {
    model,
    messages,
    stream: true,
    useOrchestrator: true,
  };

  if (conversationId) {
    requestPayload.conversationId = conversationId;
  }
  if (branchId) requestPayload.branchId = branchId;
  if (reasoningEffort) {
    requestPayload.reasoningEffort = reasoningEffort;
  }

  const response = await fetch(apiRoutes.chatCompletions, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestPayload),
    signal,
  });

  return readChatStream(response, config);
}

export async function streamChatApproval(config: ApprovalStreamConfig): Promise<string> {
  const { conversationId, threadId, model, approved, response: userResponse, signal, reasoningEffort } = config;

  const response = await fetch(apiRoutes.chatApprove, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conversationId, threadId, model, approved, response: userResponse, reasoningEffort }),
    signal,
  });

  return readChatStream(response, config);
}
