import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { redactSharedConversation } from "@/lib/share/redaction";
import { convertDbMessagesToFrontend, flattenMessageTree } from "@/lib/messageUtils";
import { PdfDocuments } from "@/components/chat/pdfDocuments";
import { PDF_ONLY_ASSISTANT_CONTENT } from "@/hooks/chat/conversationManager";

const pdf = { url: "https://utfs.io/f/generated.pdf", name: "generated.pdf", title: "Generated PDF", size: 1024, pageCount: 2 };
const createdAt = new Date("2026-09-25T05:00:00.000Z");

test("shared conversation delivers generated PDFs on original and alternate assistant versions", () => {
  const shared = redactSharedConversation({
    id: "conversation", title: "PDF chat", isPublic: true, createdAt, updatedAt: createdAt,
    messages: [{
      id: "original", role: "ASSISTANT", content: PDF_ONLY_ASSISTANT_CONTENT, createdAt, siblingIndex: 0,
      metadata: { pdfs: [pdf], humanInTheLoopRequest: { question: "secret" }, streamError: "private error" },
      versions: [{
        id: "alternate", role: "ASSISTANT", content: "Here is the revised PDF", createdAt, siblingIndex: 1,
        metadata: { pdfs: [{ ...pdf, url: "https://utfs.io/f/revised.pdf", name: "revised.pdf" }] },
      }],
    }],
  });

  assert.deepEqual(shared.messages[0].metadata, { pdfs: [pdf] });
  assert.equal("humanInTheLoopRequest" in (shared.messages[0].metadata ?? {}), false);
  assert.equal("streamError" in (shared.messages[0].metadata ?? {}), false);
  const messages = flattenMessageTree(convertDbMessagesToFrontend(shared.messages));
  assert.equal(messages[0].metadata?.pdfs?.[0].name, "revised.pdf");
  assert.equal(messages[0].versions?.[0].metadata?.pdfs?.[0].name, "generated.pdf");
  for (const version of [messages[0], ...messages[0].versions ?? []]) {
    const html = renderToStaticMarkup(createElement(PdfDocuments, { pdfs: version.metadata?.pdfs ?? [] }));
    assert.match(html, /aria-label="Preview /);
    assert.match(html, /aria-label="Download /);
    const url = version.metadata?.pdfs?.[0].url;
    assert.ok(url);
    assert.ok(html.includes(`href="${url}"`));
  }
});

test("shared conversation does not invent a PDF when metadata has none", () => {
  const shared = redactSharedConversation({
    id: "conversation", title: "No PDF", isPublic: true, createdAt, updatedAt: createdAt,
    messages: [{ id: "message", role: "ASSISTANT", content: "Text", createdAt, siblingIndex: 0, metadata: { streamError: "private error" } }],
  });
  assert.equal(shared.messages[0].metadata, undefined);
  const messages = flattenMessageTree(convertDbMessagesToFrontend(shared.messages));
  assert.equal(renderToStaticMarkup(createElement(PdfDocuments, { pdfs: messages[0].metadata?.pdfs ?? [] })), "");
});
