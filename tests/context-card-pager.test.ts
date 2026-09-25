import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ContextCards } from "@/components/chat/aiThinkingAnimation/contextCards";
import { RoutingDecision, type MemoryStatus } from "@/types/chat";

const status: MemoryStatus = {
  hasMemories: false, hasDocuments: true, hasImages: true, memoryCount: 0,
  documentCount: 2, imageCount: 1, routingDecision: RoutingDecision.Hybrid,
};
const attachments = [
  { fileName: "scene.png", fileUrl: "https://example.com/scene.png", fileType: "image/png", fileSize: 100 },
  { fileName: "one.pdf", fileUrl: "https://example.com/one.pdf", fileType: "application/pdf", fileSize: 100 },
  { fileName: "two.pdf", fileUrl: "https://example.com/two.pdf", fileType: "application/pdf", fileSize: 100 },
];

test("multiple context files show directly clickable tiles without pager controls", () => {
  const html = renderToStaticMarkup(createElement(QueryClientProvider, { client: new QueryClient() },
    createElement(ContextCards, { memoryStatus: status, attachments })));
  assert.match(html, /scene\.png/);
  assert.match(html, /one\.pdf/);
  assert.match(html, /two\.pdf/);
  assert.doesNotMatch(html, /aria-label="Previous file"|aria-label="Next file"|>1 \/ 3</);
});
