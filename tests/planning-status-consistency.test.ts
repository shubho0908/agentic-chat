import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AIThinkingAnimation } from "@/components/chat/aiThinkingAnimation";
import { ChatMessage } from "@/components/chat/chatMessage";
import { getContextualMessage } from "@/components/chat/aiThinkingAnimation/utils";
import { MessageRole } from "@/lib/schemas/chat";
import { areChatMessagePropsEqual } from "@/components/chat/chatMessageMemo";
import { CustomEventName, GraphNode, StreamEventType, ToolStatus } from "@/lib/orchestrator/constants";
import { createStreamEventMapper } from "@/lib/orchestrator/streaming";
import { RoutingDecision, type MemoryStatus } from "@/types/chat";
import type { ChatMessageProps } from "@/components/chat/chatMessageMemo";

const base: MemoryStatus = {
  hasMemories: false, hasDocuments: false, hasImages: false,
  memoryCount: 0, documentCount: 0, imageCount: 0,
};
const planning: MemoryStatus = { ...base,
  toolProgress: { toolName: CustomEventName.PLANNING, status: ToolStatus.RUNNING,
    message: "Preparing plan..." } };
const finished: MemoryStatus = { ...base,
  toolProgress: { toolName: CustomEventName.PLANNING, status: ToolStatus.COMPLETED,
    message: "" } };

function statusHtml(status: MemoryStatus): string {
  return renderToStaticMarkup(createElement(AIThinkingAnimation, { memoryStatus: status }));
}

test("planner phase is the existing status line, then falls back to processing", () => {
  const before = statusHtml(planning);
  const after = statusHtml(finished);
  assert.match(before, /role="status"[^>]*aria-live="polite"[^>]*aria-atomic="true"/);
  assert.match(before, /Preparing plan\.\.\./);
  assert.match(after, /Processing your request\.\.\./);
  assert.doesNotMatch(before + after, /Plan ready|PDF attachment is not accessible/);
  assert.equal((before.match(/role="status"/g) ?? []).length, 1);
  assert.equal((after.match(/role="status"/g) ?? []).length, 1);
});

test("planner completion yields the actual image phase and ignores stale planner text", () => {
  const vision: MemoryStatus = { ...finished, hasImages: true, imageCount: 1,
    routingDecision: RoutingDecision.VisionOnly,
    toolProgress: { ...finished.toolProgress!, message: "Plan ready" } };
  assert.equal(getContextualMessage(vision, true), "Analyzing the image to understand the context...");
  assert.doesNotMatch(getContextualMessage(vision, true), /Plan ready/);
});

test("finished planning does not add a card over the response", () => {
  const props: ChatMessageProps = { message: { id: "assistant", role: MessageRole.ASSISTANT,
    content: "The PDF lists the contact details." }, isLastMessage: true, isLoading: true,
    memoryStatus: { ...finished, hasDocuments: true, documentCount: 1,
      documentContextState: "ready", toolProgress: { ...finished.toolProgress!,
        message: "Plan ready", details: { plan: "PDF attachment is not accessible in this turn" } as never } } };
  const html = renderToStaticMarkup(createElement(ChatMessage, props));
  assert.match(html, /The PDF lists the contact details/);
  assert.doesNotMatch(html, /Plan ready|PDF attachment is not accessible|Preparing plan/);
  assert.equal(areChatMessagePropsEqual(props, { ...props, memoryStatus: planning }), false);
});

test("planner node start and end update phase without exposing plan content", () => {
  const mapper = createStreamEventMapper();
  const chunks: Uint8Array[] = [];
  const writer = { enqueue: (chunk: Uint8Array) => { chunks.push(chunk); } };
  const phase = (event: string) => ({ event, name: GraphNode.PLANNER,
    metadata: { langgraph_node: GraphNode.PLANNER } });
  mapper.map(writer, phase(StreamEventType.CHAIN_START));
  mapper.map(writer, { event: StreamEventType.CUSTOM_EVENT, name: CustomEventName.PLANNING,
    data: { plan: { plan: "PDF attachment is not accessible" } } });
  mapper.map(writer, phase(StreamEventType.CHAIN_END));
  const events = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8")
    .trim().split("\n\n").map((line) => JSON.parse(line.slice(6)));
  assert.deepEqual(events.map(({ status, message }) => [status, message]),
    [[ToolStatus.RUNNING, "Preparing plan..."], [ToolStatus.COMPLETED, ""]]);
  assert.ok(events.every(({ toolName }) => toolName === CustomEventName.PLANNING));
});
