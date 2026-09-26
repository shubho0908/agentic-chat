import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ChatMessage } from "@/components/chat/chatMessage";
import { MessageRole } from "@/lib/schemas/chat";
import { areChatMessagePropsEqual } from "@/components/chat/chatMessageMemo";
import type { ChatMessageProps } from "@/components/chat/chatMessageMemo";

const message = { id: "assistant", role: MessageRole.ASSISTANT, content: "The PDF lists the contact details." };
const base: ChatMessageProps = { message, isLastMessage: true, isLoading: true,
  memoryStatus: { hasMemories: false, hasDocuments: true, hasImages: false, memoryCount: 0,
    documentCount: 1, imageCount: 0, documentContextState: "ready",
    toolProgress: { toolName: "planning", status: "completed", message: "Plan ready",
      details: { plan: "PDF attachment is not accessible in this turn" } as never } } };

test("planner predictions cannot appear as a PDF access verdict", () => {
  const html = renderToStaticMarkup(createElement(ChatMessage, base));
  assert.match(html, /Plan ready/);
  assert.match(html, /The PDF lists the contact details/);
  assert.doesNotMatch(html, /PDF attachment is not accessible/);
});

test("memo observes a planning-to-retrieval progress change", () => {
  const next = { ...base, memoryStatus: { ...base.memoryStatus!, toolProgress: {
    ...base.memoryStatus!.toolProgress!, toolName: "search_documents", status: "completed", message: "Plan ready",
  } } } as ChatMessageProps;
  assert.equal(areChatMessagePropsEqual(base, next), false);
});
