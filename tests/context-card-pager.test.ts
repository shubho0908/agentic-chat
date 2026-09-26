import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ContextCards } from "@/components/chat/aiThinkingAnimation/contextCards";
import { RoutingDecision, type MemoryStatus } from "@/types/chat";

const status: MemoryStatus = {
  hasMemories: false,
  hasDocuments: true,
  hasImages: true,
  memoryCount: 0,
  documentCount: 2,
  imageCount: 1,
  routingDecision: RoutingDecision.Hybrid,
  documentEvidenceFiles: [
    { id: "persisted-one", fileUrl: "https://example.com/one.pdf" },
    { id: "persisted-two", fileUrl: "https://example.com/two.pdf" },
  ],
  documentEvidenceIds: ["persisted-one", "persisted-two"],
};
const attachments = [
  {
    fileName: "scene.png",
    fileUrl: "https://example.com/scene.png",
    fileType: "image/png",
    fileSize: 100,
  },
  {
    fileName: "one.pdf",
    fileUrl: "https://example.com/one.pdf",
    fileType: "application/pdf",
    fileSize: 100,
  },
  {
    fileName: "two.pdf",
    fileUrl: "https://example.com/two.pdf",
    fileType: "application/pdf",
    fileSize: 100,
  },
];

test("multiple context files show directly clickable tiles without pager controls", () => {
  const client = new QueryClient();
  const html = renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client },
      createElement(ContextCards, {
        memoryStatus: status,
        attachments,
        defaultExpanded: true,
      }),
    ),
  );
  client.clear();
  assert.match(html, /scene\.png/);
  assert.match(html, /one\.pdf/);
  assert.match(html, /two\.pdf/);
  assert.doesNotMatch(
    html,
    /aria-label="Previous file"|aria-label="Next file"|>1 \/ 3</,
  );
  assert.match(html, /overflow-hidden rounded-2xl border border-border\/70/);
  assert.match(html, /border-t border-border\/35 dark:border-white\/\[0\.06\]/);
  assert.match(html, /dark:bg-\[#171719\]/);
  assert.doesNotMatch(html, /dark:bg-gradient|dark:from-card|dark:to-muted/);
  assert.doesNotMatch(html, /rounded-\[20px\] p-3\.5/);
});

test("context accordion starts closed and reveals tiles when expanded", () => {
  const closedClient = new QueryClient();
  const closed = renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client: closedClient },
      createElement(ContextCards, { memoryStatus: status, attachments }),
    ),
  );
  closedClient.clear();
  assert.match(closed, /aria-expanded="false"/);
  assert.doesNotMatch(closed, /scene\.png|one\.pdf|two\.pdf/);
  const openClient = new QueryClient();
  const open = renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client: openClient },
      createElement(ContextCards, {
        memoryStatus: status,
        attachments,
        defaultExpanded: true,
      }),
    ),
  );
  openClient.clear();
  assert.match(open, /aria-expanded="true"/);
  assert.match(open, /scene\.png/);
  assert.match(open, /one\.pdf/);
});
