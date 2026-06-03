import type { ApprovalStreamConfig, HumanInTheLoopRequestEvent, MemoryStatus, StreamConfig } from "@/types/chat";
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

function readerToIterable(reader: ReadableStreamDefaultReader<Uint8Array>): AsyncIterable<Uint8Array> {
  return {
    [Symbol.asyncIterator]() {
      return {
        next: () => reader.read().then(({ done, value }) => ({ done: !!done, value: value! })),
        return: () => reader.cancel().then(() => ({ done: true as const, value: undefined })),
      };
    },
  };
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

async function readChatStream(response: Response, callbacks: StreamCallbacks): Promise<string> {
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
  } = callbacks;

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
        hasImages: optionalBoolean(parsed.hasImages) ?? false,
        imageCount: optionalNumber(parsed.imageCount) ?? 0,
        routingDecision: optionalString(parsed.routingDecision) as MemoryStatus["routingDecision"],
        skippedMemory: optionalBoolean(parsed.skippedMemory),
        activeToolName: optionalString(parsed.activeToolName),
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

    if ((parsedType === ArtifactEventType.START || parsedType === ArtifactEventType.CHUNK || parsedType === ArtifactEventType.END) && onArtifact) {
      onArtifact(parsed as unknown as ArtifactEvent);
    }

    if (typeof parsed.content === "string" && parsed.content && !parsedType) {
      contentParts.push(parsed.content);
      onChunk(parsed.content);
    }
  }

  const SSE_DATA_PREFIX = "data:";
  try {
    for await (const value of readerToIterable(reader)) {
      const chunk = decoder.decode(value, { stream: true });
      buffer += chunk;

      let newlineIdx: number;
      while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newlineIdx);
        buffer = buffer.slice(newlineIdx + 1);

        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith(SSE_DATA_PREFIX)) continue;

        const data = trimmed.slice(SSE_DATA_PREFIX.length).trim();
        if (data === '[DONE]') continue;

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
      if (data !== '[DONE]') {
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

  return contentParts.join('');
}

export async function streamChatCompletion(config: StreamConfig): Promise<string> {
  const { messages, model, signal, conversationId, memoryEnabled, thinkingEnabled } = config;

  const requestPayload: Record<string, unknown> = {
    model,
    messages,
    stream: true,
    useOrchestrator: true,
  };

  if (conversationId) {
    requestPayload.conversationId = conversationId;
  }
  if (memoryEnabled !== undefined && memoryEnabled !== true) {
    requestPayload.memoryEnabled = memoryEnabled;
  }
  if (thinkingEnabled) {
    requestPayload.thinkingEnabled = thinkingEnabled;
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
  const { conversationId, threadId, model, approved, response: userResponse, signal } = config;

  const response = await fetch(apiRoutes.chatApprove, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conversationId, threadId, model, approved, response: userResponse }),
    signal,
  });

  return readChatStream(response, config);
}
