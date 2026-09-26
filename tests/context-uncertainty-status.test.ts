import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AIThinkingAnimation } from "@/components/chat/aiThinkingAnimation";
import { getContextualMessage } from "@/components/chat/aiThinkingAnimation/utils";
import type { MemoryStatus } from "@/types/chat";

const unavailable: MemoryStatus = {
  hasMemories: false, attemptedMemory: false, hasDocuments: true, hasImages: false,
  memoryCount: 0, documentCount: 0, imageCount: 0, skippedMemory: true,
  documentContextState: "unavailable",
};

test("unresolved attachment selection never claims to search or synthesize documents", () => {
  const html = renderToStaticMarkup(createElement(AIThinkingAnimation, { memoryStatus: unavailable }));
  assert.match(html, /Attachment context unavailable/);
  assert.doesNotMatch(html, /Searching documents|Synthesizing response with documents/);
  assert.equal(getContextualMessage(unavailable, true), "Waiting for attachment clarification...");
});

test("unresolved image plus PDF never displays an image analysis card", () => {
  const html = renderToStaticMarkup(createElement(AIThinkingAnimation, {
    memoryStatus: { ...unavailable, hasImages: true, imageCount: 1, includeCurrentImages: false },
  }));
  assert.match(html, /Attachment context unavailable/);
  assert.doesNotMatch(html, /Analyzing image|Looking at an image|Analyzing the image/);
});
