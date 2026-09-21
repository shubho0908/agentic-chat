import {
  encodeToolCall,
  encodeToolProgress,
  encodeThinkingChunk,
  encodeArtifactEvent,
  encodeResponseIncomplete,
} from "@/lib/chat/streamingHelpers";
import type { StreamWriter } from "@/lib/chat/safeStream";

import { ToolName } from "@/lib/tools/constants";
import { CustomEventName, StreamEventType, ToolStatus, HUMAN_IN_THE_LOOP_REQUEST_TYPE, GraphNode } from "./constants";
import { toJsonValue } from "@/lib/json";
import { createArtifactStreamParser, type ArtifactSSE } from "./artifactParser";

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

interface StreamEventMapper {
  map(writer: StreamWriter, event: Record<string, unknown>): void;
  flush(writer: StreamWriter): void;
  bufferEvent(chunk: Uint8Array, value: unknown): void;
  takeAssistantOutput(): { text: string; artifacts: Uint8Array[]; artifactText: string; events: Uint8Array[]; eventText: string };
}

export function createStreamEventMapper(): StreamEventMapper {
  let askUserPending = false;
  let assistantText = "";
  let artifactText = "";
  let artifactChunks: Uint8Array[] = [];
  let eventChunks: Uint8Array[] = [];
  let eventValues: unknown[] = [];
  const artifactParser = createArtifactStreamParser();

  const getNode = (event: Record<string, unknown>): string | undefined => {
    const metadata = event.metadata as Record<string, unknown> | undefined;
    return typeof metadata?.langgraph_node === "string" ? metadata.langgraph_node : undefined;
  };

  const isNestedToolEvent = (event: Record<string, unknown>, name: string): boolean => {
    if (name === ToolName.DEEP_RESEARCH) return false;
    return getNode(event) !== GraphNode.TOOLS;
  };

  function emitParsedResults(results: Array<{ text: string } | { event: ArtifactSSE }>) {
    for (const item of results) {
      if ("text" in item) {
        assistantText += item.text;
      } else {
        artifactText += JSON.stringify(item.event);
        artifactChunks.push(encodeArtifactEvent(item.event as unknown as Record<string, unknown>));
      }
    }
  }

  const bufferEvent = (chunk: Uint8Array, value: unknown) => {
    eventChunks.push(chunk);
    eventValues.push(value);
  };

  return {
    bufferEvent,
    map(_writer, event) {
      const eventType = event.event as string;

      switch (eventType) {
        case StreamEventType.CHAT_MODEL_STREAM: {
          if (askUserPending) break;
          const sourceNode = getNode(event);
          if (sourceNode !== GraphNode.AGENT) break;
          const chunk = event.data as {
            chunk?: {
              content?: string | Array<{ type: string; text?: string; reasoning?: string }>;
              additional_kwargs?: { reasoning_content?: string };
            };
          };

          // Handle reasoning: Chat Completions API format (additional_kwargs.reasoning_content)
          const reasoningContent = chunk?.chunk?.additional_kwargs?.reasoning_content;
          if (reasoningContent && typeof reasoningContent === "string") {
            bufferEvent(encodeThinkingChunk(reasoningContent), { type: "thinking", content: reasoningContent });
          }

          const content = chunk?.chunk?.content;
          if (typeof content === "string" && content) {
            emitParsedResults(artifactParser.push(content));
          } else if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === "reasoning" && block.reasoning) {
                bufferEvent(encodeThinkingChunk(block.reasoning), { type: "thinking", content: block.reasoning });
              } else if (block.type === "text" && block.text) {
                emitParsedResults(artifactParser.push(block.text));
              }
            }
          }
          break;
        }


        case StreamEventType.CHAT_MODEL_END: {
          if (getNode(event) !== GraphNode.AGENT) break;
          const data = event.data as {
            output?: { response_metadata?: { finish_reason?: unknown } };
          } | undefined;
          if (data?.output?.response_metadata?.finish_reason === "length") {
            bufferEvent(encodeResponseIncomplete("length"), { type: "response_incomplete", reason: "length" });
          }
          break;
        }

        case StreamEventType.TOOL_START: {
          const name = event.name as string;
          if (name === ToolName.ASK_USER) {
            askUserPending = true;
            break;
          }
          if (isNestedToolEvent(event, name)) break;
          const runId = typeof event.run_id === "string" ? event.run_id : `${name}-${Date.now()}`;
          const data = event.data as { input?: Record<string, unknown> } | undefined;
          const args = extractToolArgs(data?.input ?? {});
          bufferEvent(encodeToolCall(name, runId, args), { type: "tool_call", toolName: name, toolCallId: runId, args });
          bufferEvent(encodeToolProgress(name, ToolStatus.RUNNING, `Executing ${name}...`), { type: "tool_progress", toolName: name, status: ToolStatus.RUNNING, message: `Executing ${name}...` });
          break;
        }

        case StreamEventType.TOOL_END: {
          const name = event.name as string;
          if (name === ToolName.ASK_USER) {
            askUserPending = false;
            break;
          }
          if (isNestedToolEvent(event, name)) break;
          bufferEvent(encodeToolProgress(name, ToolStatus.COMPLETED, `${name} completed`), { type: "tool_progress", toolName: name, status: ToolStatus.COMPLETED, message: `${name} completed` });
          break;
        }

        case StreamEventType.CUSTOM_EVENT: {
          const customData = event.data as Record<string, unknown> | undefined;
          const eventName = event.name as string | undefined;

          if (customData?.type === CustomEventName.THINKING) {
            bufferEvent(encodeThinkingChunk(customData.content as string), { type: "thinking", content: customData.content });
          }
          if (customData?.type === CustomEventName.PLANNING || eventName === CustomEventName.PLANNING) {
            const planData = customData?.plan ?? customData;
            bufferEvent(
              encodeToolProgress(CustomEventName.PLANNING, ToolStatus.COMPLETED, "Plan ready", planData as Record<string, unknown>),
              { type: "tool_progress", toolName: CustomEventName.PLANNING, status: ToolStatus.COMPLETED, message: "Plan ready", details: planData },
            );
          }
          if (eventName === CustomEventName.RESEARCH_PROGRESS) {
            const step = (customData?.step as string) ?? "researching";
            const detail = (customData?.detail as string) ?? "Researching...";
            const images = Array.isArray(customData?.images) ? customData.images : undefined;
            const details = images ? { images } : undefined;
            bufferEvent(
              encodeToolProgress(ToolName.DEEP_RESEARCH, ToolStatus.RUNNING, `[${step}] ${detail}`, details),
              { type: "tool_progress", toolName: ToolName.DEEP_RESEARCH, status: ToolStatus.RUNNING, message: `[${step}] ${detail}`, details },
            );
          }
          if (eventName === CustomEventName.SEARCH_IMAGES) {
            const images = Array.isArray(customData?.images) ? customData.images : undefined;
            if (images) {
              bufferEvent(
                encodeToolProgress(ToolName.WEB_SEARCH, ToolStatus.RUNNING, "Found images", { images }),
                { type: "tool_progress", toolName: ToolName.WEB_SEARCH, status: ToolStatus.RUNNING, message: "Found images", details: { images } },
              );
            }
          }
          if (eventName === CustomEventName.SEARCH_SOURCES) {
            const sources = Array.isArray(customData?.sources) ? customData.sources : undefined;
            if (sources && sources.length > 0) {
              const tool = customData?.tool === ToolName.DEEP_RESEARCH ? ToolName.DEEP_RESEARCH : ToolName.WEB_SEARCH;
              const message = `Found ${sources.length} source${sources.length === 1 ? "" : "s"}`;
              bufferEvent(
                encodeToolProgress(tool, ToolStatus.COMPLETED, message, { sources }),
                { type: "tool_progress", toolName: tool, status: ToolStatus.COMPLETED, message, details: { sources } },
              );
            }
          }
          break;
        }
      }
    },
    flush() {
      emitParsedResults(artifactParser.flush());
    },
    takeAssistantOutput() {
      const value = { text: assistantText, artifacts: artifactChunks, artifactText, events: eventChunks, eventText: JSON.stringify(eventValues) };
      assistantText = "";
      artifactText = "";
      artifactChunks = [];
      eventChunks = [];
      eventValues = [];
      return value;
    },
  };
}

export function encodeGraphInterrupt(interruptData: unknown): Uint8Array {
  return encodeHumanInTheLoopRequest(interruptData as Record<string, unknown>);
}
