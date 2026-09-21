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
  takeAssistantOutput(): { text: string; artifacts: Uint8Array[]; artifactText: string };
}

export function createStreamEventMapper(): StreamEventMapper {
  let askUserPending = false;
  let assistantText = "";
  let artifactText = "";
  let artifactChunks: Uint8Array[] = [];
  const artifactParser = createArtifactStreamParser();

  const getNode = (event: Record<string, unknown>): string | undefined => {
    const metadata = event.metadata as Record<string, unknown> | undefined;
    return typeof metadata?.langgraph_node === "string" ? metadata.langgraph_node : undefined;
  };

  const isNestedToolEvent = (event: Record<string, unknown>, name: string): boolean => {
    if (name === ToolName.DEEP_RESEARCH) return false;
    return getNode(event) !== GraphNode.TOOLS;
  };

  function emitParsedResults(writer: StreamWriter, results: Array<{ text: string } | { event: ArtifactSSE }>) {
    for (const item of results) {
      if ("text" in item) {
        assistantText += item.text;
      } else {
        if (typeof item.event.content === "string") artifactText += item.event.content;
        artifactChunks.push(encodeArtifactEvent(item.event as unknown as Record<string, unknown>));
      }
    }
  }

  return {
    map(writer, event) {
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
            writer.enqueue(encodeThinkingChunk(reasoningContent));
          }

          const content = chunk?.chunk?.content;
          if (typeof content === "string" && content) {
            emitParsedResults(writer, artifactParser.push(content));
          } else if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === "reasoning" && block.reasoning) {
                writer.enqueue(encodeThinkingChunk(block.reasoning));
              } else if (block.type === "text" && block.text) {
                emitParsedResults(writer, artifactParser.push(block.text));
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
            writer.enqueue(encodeResponseIncomplete("length"));
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
          writer.enqueue(encodeToolCall(name, runId, args));
          writer.enqueue(encodeToolProgress(name, ToolStatus.RUNNING, `Executing ${name}...`));
          break;
        }

        case StreamEventType.TOOL_END: {
          const name = event.name as string;
          if (name === ToolName.ASK_USER) {
            askUserPending = false;
            break;
          }
          if (isNestedToolEvent(event, name)) break;
          writer.enqueue(encodeToolProgress(name, ToolStatus.COMPLETED, `${name} completed`));
          break;
        }

        case StreamEventType.CUSTOM_EVENT: {
          const customData = event.data as Record<string, unknown> | undefined;
          const eventName = event.name as string | undefined;

          if (customData?.type === CustomEventName.THINKING) {
            writer.enqueue(encodeThinkingChunk(customData.content as string));
          }
          if (customData?.type === CustomEventName.PLANNING || eventName === CustomEventName.PLANNING) {
            const planData = customData?.plan ?? customData;
            writer.enqueue(
              encodeToolProgress(CustomEventName.PLANNING, ToolStatus.COMPLETED, "Plan ready", planData as Record<string, unknown>)
            );
          }
          if (eventName === CustomEventName.RESEARCH_PROGRESS) {
            const step = (customData?.step as string) ?? "researching";
            const detail = (customData?.detail as string) ?? "Researching...";
            const images = Array.isArray(customData?.images) ? customData.images : undefined;
            writer.enqueue(
              encodeToolProgress(
                ToolName.DEEP_RESEARCH,
                ToolStatus.RUNNING,
                `[${step}] ${detail}`,
                images ? { images } : undefined
              )
            );
          }
          if (eventName === CustomEventName.SEARCH_IMAGES) {
            const images = Array.isArray(customData?.images) ? customData.images : undefined;
            if (images) {
              writer.enqueue(
                encodeToolProgress(ToolName.WEB_SEARCH, ToolStatus.RUNNING, "Found images", { images })
              );
            }
          }
          if (eventName === CustomEventName.SEARCH_SOURCES) {
            const sources = Array.isArray(customData?.sources) ? customData.sources : undefined;
            if (sources && sources.length > 0) {
              const tool = customData?.tool === ToolName.DEEP_RESEARCH ? ToolName.DEEP_RESEARCH : ToolName.WEB_SEARCH;
              writer.enqueue(
                encodeToolProgress(tool, ToolStatus.COMPLETED, `Found ${sources.length} source${sources.length === 1 ? "" : "s"}`, { sources })
              );
            }
          }
          break;
        }
      }
    },
    flush(writer) {
      emitParsedResults(writer, artifactParser.flush());
    },
    takeAssistantOutput() {
      const value = { text: assistantText, artifacts: artifactChunks, artifactText };
      assistantText = "";
      artifactText = "";
      artifactChunks = [];
      return value;
    },
  };
}

export function handleGraphInterrupt(
  writer: StreamWriter,
  interruptData: unknown
): void {
  const data = interruptData as Record<string, unknown>;
  writer.enqueue(encodeHumanInTheLoopRequest(data));
}
