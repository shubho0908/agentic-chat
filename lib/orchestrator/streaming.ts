import {
  encodeChatChunk,
  encodeDone,
  encodeToolCall,
  encodeToolProgress,
  encodeToolResult,
  encodeThinkingChunk,
} from "@/lib/chat/streamingHelpers";

import { ToolName } from "@/lib/tools/constants";
import { CustomEventName, StreamEventType, ToolStatus, HUMAN_IN_THE_LOOP_REQUEST_TYPE, GraphNode } from "./constants";
import { toJsonValue } from "@/lib/json";

const encoder = new TextEncoder();

function encodeHumanInTheLoopRequest(data: Record<string, unknown>): Uint8Array {
  const payload = toJsonValue({ type: HUMAN_IN_THE_LOOP_REQUEST_TYPE, ...data }) ?? {};
  return encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);
}

function extractToolArgs(input: Record<string, unknown>): Record<string, unknown> {
  if (typeof input.input === "string") {
    const rawInput = input.input.trim();
    if (!rawInput.startsWith("{")) {
      return { input: input.input };
    }

    try {
      const parsed = JSON.parse(rawInput);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return { input: input.input };
    }
  }
  return input;
}

function extractToolOutput(output: unknown): string | Record<string, unknown> | unknown[] {
  if (!output) return "";
  if (typeof output === "string") return output;
  if (typeof output === "object" && output !== null && !Array.isArray(output)) {
    const obj = output as Record<string, unknown>;
    if (obj.kwargs && typeof obj.kwargs === "object" && !Array.isArray(obj.kwargs)) {
      const kwargs = obj.kwargs as Record<string, unknown>;
      if (typeof kwargs.content === "string") return kwargs.content;
    }
    if (typeof obj.content === "string") return obj.content;
  }
  return output as string | Record<string, unknown> | unknown[];
}

interface StreamEventMapper {
  map(controller: ReadableStreamDefaultController, event: Record<string, unknown>): void;
}

export function createStreamEventMapper(): StreamEventMapper {
  let askUserPending = false;

  return {
    map(controller, event) {
      const eventType = event.event as string;

      switch (eventType) {
        case StreamEventType.CHAT_MODEL_STREAM: {
          if (askUserPending) break;
          const sourceNode = (event.metadata as Record<string, unknown>)?.langgraph_node;
          if (sourceNode === GraphNode.PLANNER) break;
          const chunk = event.data as {
            chunk?: {
              content?: string | Array<{ type: string; text?: string; reasoning?: string }>;
              additional_kwargs?: { reasoning_content?: string };
            };
          };

          // Handle reasoning: Chat Completions API format (additional_kwargs.reasoning_content)
          const reasoningContent = chunk?.chunk?.additional_kwargs?.reasoning_content;
          if (reasoningContent && typeof reasoningContent === "string") {
            controller.enqueue(encodeThinkingChunk(reasoningContent));
          }

          const content = chunk?.chunk?.content;
          if (typeof content === "string" && content) {
            controller.enqueue(encodeChatChunk(content));
          } else if (Array.isArray(content)) {
            // Responses API format: content blocks include reasoning and text
            for (const block of content) {
              if (block.type === "reasoning" && block.reasoning) {
                controller.enqueue(encodeThinkingChunk(block.reasoning));
              } else if (block.type === "text" && block.text) {
                controller.enqueue(encodeChatChunk(block.text));
              }
            }
          }
          break;
        }

        case StreamEventType.TOOL_START: {
          const name = event.name as string;
          if (name === ToolName.ASK_USER) {
            askUserPending = true;
            break;
          }
          const runId = typeof event.run_id === "string" ? event.run_id : `${name}-${Date.now()}`;
          const data = event.data as { input?: Record<string, unknown> } | undefined;
          const args = extractToolArgs(data?.input ?? {});
          controller.enqueue(encodeToolCall(name, runId, args));
          controller.enqueue(encodeToolProgress(name, ToolStatus.RUNNING, `Executing ${name}...`));
          break;
        }

        case StreamEventType.TOOL_END: {
          const name = event.name as string;
          if (name === ToolName.ASK_USER) break;
          const runId = typeof event.run_id === "string" ? event.run_id : `${name}-${Date.now()}`;
          const data = event.data as { output?: unknown } | undefined;
          const result = extractToolOutput(data?.output);
          controller.enqueue(encodeToolResult(name, runId, result));
          controller.enqueue(encodeToolProgress(name, ToolStatus.COMPLETED, `${name} completed`));
          break;
        }

        case StreamEventType.CUSTOM_EVENT: {
          const customData = event.data as Record<string, unknown> | undefined;
          const eventName = event.name as string | undefined;

          if (customData?.type === CustomEventName.THINKING) {
            controller.enqueue(encodeThinkingChunk(customData.content as string));
          }
          if (customData?.type === CustomEventName.PLANNING || eventName === CustomEventName.PLANNING) {
            const planData = customData?.plan ?? customData;
            controller.enqueue(
              encodeToolProgress(CustomEventName.PLANNING, ToolStatus.COMPLETED, "Plan ready", planData as Record<string, unknown>)
            );
          }
          break;
        }
      }
    },
  };
}

export function handleGraphInterrupt(
  controller: ReadableStreamDefaultController,
  interruptData: unknown
): void {
  const data = interruptData as Record<string, unknown>;
  controller.enqueue(encodeHumanInTheLoopRequest(data));
}

export function handleGraphEnd(controller: ReadableStreamDefaultController): void {
  controller.enqueue(encodeDone());
}
