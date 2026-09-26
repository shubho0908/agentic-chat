import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ContextCards } from "@/components/chat/aiThinkingAnimation/contextCards";
import { useTokenUsageWithMemory } from "@/hooks/useTokenUsageWithMemory";
import { RoutingDecision, type MemoryStatus } from "@/types/chat";

const image = {
  id: "image-1",
  fileName: "scene.png",
  fileUrl: "https://example.com/scene.png",
  fileType: "image/png",
  fileSize: 1024,
};
const document = {
  id: "client-upload-id",
  fileName: "resume.pdf",
  fileUrl: "https://example.com/resume.pdf",
  fileType: "application/pdf",
  fileSize: 288500,
};
const status: MemoryStatus = {
  hasMemories: false,
  hasDocuments: true,
  hasImages: true,
  memoryCount: 0,
  documentCount: 1,
  imageCount: 1,
  routingDecision: RoutingDecision.Hybrid,
  documentContextState: "ready",
  documentEvidenceIds: ["persisted-pdf-id"],
  documentEvidenceFiles: [
    { id: "persisted-pdf-id", fileUrl: document.fileUrl },
  ],
};
function Pipeline() {
  const { mergedMemoryStatus } = useTokenUsageWithMemory({
    memoryStatus: status,
  });
  assert.ok(mergedMemoryStatus);
  return createElement(ContextCards, {
    memoryStatus: mergedMemoryStatus,
    attachments: [image, document],
    defaultExpanded: true,
  });
}

test("streamed document identities survive token-usage merge and render both mixed tiles", () => {
  const client = new QueryClient();
  const html = renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client },
      createElement(Pipeline),
    ),
  );
  client.clear();
  assert.match(html, /scene\.png/);
  assert.match(html, /resume\.pdf/);
  assert.match(html, /Relevant passages used/);
  assert.doesNotMatch(
    html,
    /File previews are not available|Close context details|Previous file|Next file/,
  );
});
