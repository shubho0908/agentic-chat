import test from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { MessageRole } from "@/lib/schemas/chat";
import { routeContext } from "@/lib/contextRouter";
import { RoutingDecision } from "@/types/chat";
import { attachHistoricalImagesToModelTurn } from "@/lib/chat/modelResourceImages";
import { toOpenAIChatMessages } from "@/lib/chat/streamHandler";

const date = new Date("2026-09-26T05:30:00.000Z");
const image = { id: "old-image", kind: "image", fileName: "portrait.png", fileUrl: "https://utfs.io/f/portrait.png", fileType: "image/png", fileSize: 30 };
const doc = { id: "new-doc", kind: "document", fileName: "brief.pdf", fileUrl: "https://example.com/brief.pdf", fileType: "application/pdf", fileSize: 30 };
async function mock<T>(current: typeof image[], old: Array<{id:string; attachments: typeof image[]}>, fn: () => Promise<T>) {
  const first = prisma.message.findFirst; const many = prisma.message.findMany; const find = prisma.attachment.findMany;
  Object.defineProperty(prisma.message, "findFirst", { configurable: true, value: async () => ({ id: "now", createdAt: date, parentMessageId: null, attachments: current }) });
  Object.defineProperty(prisma.message, "findMany", { configurable: true, value: async () => old });
  Object.defineProperty(prisma.attachment, "findMany", { configurable: true, value: async (args: { select?: { messageId?: boolean } }) =>
    args.select?.messageId ? [
      ...current.filter((file) => file.kind === "image").map((file) => ({ ...file, messageId: "now" })),
      ...old.flatMap((message) => message.attachments.filter((file) => file.kind === "image")
        .map((file) => ({ ...file, messageId: message.id }))),
    ] : find(args as never) });
  try { return await fn(); } finally {
    Object.defineProperty(prisma.attachment, "findMany", { configurable: true, value: find });
    Object.defineProperty(prisma.message, "findFirst", { configurable: true, value: first });
    Object.defineProperty(prisma.message, "findMany", { configurable: true, value: many });
  }
}
test("old image outside client window is selected and added to the model turn over unrelated current PDF", async () => {
  await mock([doc], [{ id: "older", attachments: [image] }], async () => {
    const request = "What is in the image I sent earlier?";
    const result = await routeContext(request, "owner", [], "conv", null, false, { currentMessageId: "now" });
    assert.deepEqual(result.metadata.historicalImageFiles, [{ ...image, kind: "image" }]);
    const prepared = attachHistoricalImagesToModelTurn([{ role: MessageRole.USER, content: request }], result.metadata.historicalImageFiles || []);
    assert.deepEqual((toOpenAIChatMessages(prepared)[0] as {content: unknown[]}).content[1], { type: "image_url", image_url: { url: image.fileUrl } });
    assert.equal(result.metadata.documentEvidenceFiles, undefined);
  });
});
test("ambiguous old documents do not silently use the newest one", async () => {
  await mock([], [{ id: "a", attachments: [{...doc,id:"first",fileName:"first.pdf"}] }, {id:"b", attachments:[{...doc,id:"second",fileName:"second.pdf"}]}], async () => {
    const result = await routeContext("Summarize the earlier PDF", "owner", [], "conv", null, false, { currentMessageId: "now" });
    assert.match(result.unresolved?.prompt ?? "", /Which file/);
    assert.equal(result.metadata.documentEvidenceIds, undefined);
  });
});

test("an old document remains the selected evidence 4 turns later rather than the unrelated current image", async () => {
  const textDoc = { id: "old-text", kind: "document", fileName: "notes.txt", fileUrl: "https://example.com/notes.txt", fileType: "text/plain", fileSize: 30 };
  await mock([image], [{ id: "old-turn", attachments: [textDoc] }], async () => {
    const oldAttachmentFind = prisma.attachment.findMany;
    const oldFetch = globalThis.fetch;
    Object.defineProperty(prisma.attachment, "findMany", { configurable: true, value: async (args: { select?: { messageId?: boolean } }) => args.select?.messageId
      ? [{ ...image, messageId: "now" }] : [textDoc] });
    try {
      const result = await routeContext("What did the earlier document say?", "owner", [], "conv", null, false, { currentMessageId: "now" });
      assert.deepEqual(result.metadata.documentEvidenceFiles, [{ ...textDoc, kind: "document" }]);
      assert.equal(result.metadata.routingDecision, RoutingDecision.DocumentsOnly);
      assert.equal(result.metadata.attachmentContextKind, "document");
    } finally {
      Object.defineProperty(prisma.attachment, "findMany", { configurable: true, value: oldAttachmentFind });
      globalThis.fetch = oldFetch;
    }
  });
});

test("old image and current document comparison provides both image part and scoped document evidence", async () => {
  await mock([doc], [{ id: "old", attachments: [image] }], async () => {
    const oldAttachmentFind = prisma.attachment.findMany;
    Object.defineProperty(prisma.attachment, "findMany", { configurable: true, value: async (args: { select?: { messageId?: boolean } }) => args.select?.messageId
      ? [{ ...image, messageId: "old" }] : [] });
    try {
      const result = await routeContext("Compare the earlier image with this PDF", "owner", [], "conv", null, false, { currentMessageId: "now" });
      assert.deepEqual(result.metadata.historicalImageFiles, [{ ...image, kind: "image" }]);
      assert.deepEqual(result.metadata.documentEvidenceFiles, [{ ...doc, kind: "document" }]);
      assert.equal(result.metadata.routingDecision, RoutingDecision.Hybrid);
    } finally { Object.defineProperty(prisma.attachment, "findMany", { configurable: true, value: oldAttachmentFind }); }
  });
});

test("untrusted or non-HTTPS historical image fails closed before a model image part is added", async () => {
  await mock([], [{ id: "old", attachments: [{ ...image, fileUrl: "http://utfs.io/f/portrait.png" }] }], async () => {
    const result = await routeContext("Describe the earlier image", "owner", [], "conv", null, false, { currentMessageId: "now" });
    assert.equal(result.unresolved?.reason, "retrieval-unavailable");
    assert.equal(result.metadata.historicalImageFiles, undefined);
  });
});

test("a missing older image produces an explicit unresolved notice", async () => {
  await mock([], [], async () => {
    const result = await routeContext("Describe those images", "owner", [], "conv", null, false, { currentMessageId: "now" });
    assert.ok(result.unresolved?.prompt);
    assert.equal(result.metadata.historicalImageFiles, undefined);
  });
});
