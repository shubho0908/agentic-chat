import type { ApprovalStreamConfig, HumanInTheLoopRequestEvent, StreamConfig } from "@/types/chat";
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

  let fullContent = "";
  let thinkingContent = "";
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
  } = callbacks;

  try {
    while (true) {
      const { done, value } = await reader.read();

      const chunk = decoder.decode(value, { stream: !done });
      buffer += chunk;

      const lines = buffer.split('\n');
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmedLine = line.trim();

        if (!trimmedLine || !trimmedLine.startsWith('data:')) continue;

        const data = trimmedLine.slice(5).trim();

        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);

          if (parsed.error) {
            throw new Error(parsed.error);
          }

          if (parsed.type === 'memory_status' && onMemoryStatus) {
            onMemoryStatus({
              hasMemories: parsed.hasMemories,
              attemptedMemory: parsed.attemptedMemory,
              hasDocuments: parsed.hasDocuments,
              memoryCount: parsed.memoryCount,
              documentCount: parsed.documentCount || 0,
              hasImages: parsed.hasImages || false,
              imageCount: parsed.imageCount || 0,
              routingDecision: parsed.routingDecision,
              skippedMemory: parsed.skippedMemory,
              activeToolName: parsed.activeToolName,
              tokenUsage: parsed.tokenUsage,
            });
          }

          if (parsed.type === 'thinking' && onThinking) {
            thinkingContent += parsed.content ?? '';
            onThinking(thinkingContent);
          }

          if (parsed.type === 'tool_call' && onToolCall) {
            onToolCall({
              toolName: parsed.toolName,
              toolCallId: parsed.toolCallId,
              args: parsed.args,
            });
          }

          if (parsed.type === 'tool_result' && onToolResult) {
            onToolResult({
              toolName: parsed.toolName,
              toolCallId: parsed.toolCallId,
              result: parsed.result,
            });
          }

          if (parsed.type === 'tool_progress' && onToolProgress) {
            onToolProgress({
              toolName: parsed.toolName,
              status: parsed.status,
              message: parsed.message,
              details: parsed.details,
            });
          }

          if (parsed.type === 'hitl_request' && onHumanInTheLoopRequest) {
            onHumanInTheLoopRequest(normalizeHumanInTheLoopRequest(parsed));
          }

          if (parsed.type === 'usage_updated' && onUsageUpdated) {
            onUsageUpdated({
              usageCount: parsed.usageCount,
              remaining: parsed.remaining,
              limit: parsed.limit,
            });
          }

          if (parsed.content && !parsed.type) {
            fullContent += parsed.content;
            onChunk(fullContent);
          }
        } catch (err) {
          if (!(err instanceof SyntaxError)) {
            throw err;
          }
          logger.warn('Failed to parse SSE data:', data, err);
        }
      }

      if (done) {
        if (buffer.trim()) {
          const trimmedLine = buffer.trim();
          if (trimmedLine.startsWith('data:')) {
            const data = trimmedLine.slice(5).trim();
            if (data !== '[DONE]') {
              try {
                const parsed = JSON.parse(data);

                if (parsed.error) {
                  throw new Error(parsed.error);
                }

                if (parsed.content && !parsed.type) {
                  fullContent += parsed.content;
                  onChunk(fullContent);
                }

                if (parsed.type === HUMAN_IN_THE_LOOP_REQUEST_TYPE && onHumanInTheLoopRequest) {
                  onHumanInTheLoopRequest(normalizeHumanInTheLoopRequest(parsed));
                }
              } catch (err) {
                if (!(err instanceof SyntaxError)) {
                  throw err;
                }
                logger.warn('Failed to parse final SSE data:', data, err);
              }
            }
          }
        }
        break;
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

  return fullContent;
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
