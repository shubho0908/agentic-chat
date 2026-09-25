import assert from "node:assert/strict";
import { test } from "node:test";
import { allDocumentsReady, buildRetrievalQueries, isInlineEligibleType, shouldSkipTextContextForImage } from "@/lib/contextRouter";
import { selectDocumentAttachmentsForTurn } from "@/lib/chat/attachmentRouting";
import { buildMultimodalContent } from "@/lib/contentUtils";
import { MessageRole } from "@/lib/schemas/chat";

const image: { id?: string; fileUrl: string; fileName: string; fileType: string; fileSize: number } = { fileUrl: "https://example.com/photo.png", fileName: "photo.png", fileType: "image/png", fileSize: 12 };
const pdf = { id: "pdf-id", fileUrl: "https://example.com/one.pdf", fileName: "one.pdf", fileType: "application/pdf", fileSize: 12 };
const secondPdf = { ...pdf, id: "pdf-two", fileName: "two.pdf" };

test("mixed image and documents retain vision parts and both document IDs", () => {
  const attachments = [image, pdf, secondPdf];
  const content = buildMultimodalContent("Hi", attachments);
  assert.ok(Array.isArray(content));
  assert.equal(content.filter((part) => part.type === "image_url").length, 1);
  assert.deepEqual(selectDocumentAttachmentsForTurn([{ attachments }], false).map((a) => a.id), ["pdf-id", "pdf-two"]);
  assert.equal(shouldSkipTextContextForImage(true, "Hi", true), false);
  assert.equal(shouldSkipTextContextForImage(true, "", true), false);
  assert.equal(shouldSkipTextContextForImage(true, "Hi", false), true);
});

test("image plus document without a caption still generates a RAG query", () => {
  assert.deepEqual(buildRetrievalQueries("", [], false), ["Summarize the attached documents."]);
  assert.ok(buildRetrievalQueries("Hi", [{ role: MessageRole.USER, content: "Previous turn" }], false).length > 0);
});

test("a batch is ready only when every expected document finished indexing", () => {
  const five = ["a", "b", "c", "d", "e"];
  const complete = five.map((id) => ({ id, processingStatus: "COMPLETED" }));
  assert.equal(allDocumentsReady(five, complete), true);
  assert.equal(allDocumentsReady(five, complete.slice(0, 4)), false);
  assert.equal(allDocumentsReady(five, [...complete.slice(0, 4), { id: "e", processingStatus: "FAILED" }]), false);
  assert.equal(allDocumentsReady(five, [...complete.slice(0, 4), { id: "other", processingStatus: "COMPLETED" }]), false);
  assert.equal(allDocumentsReady([], []), false);
});

test("mixed PDF plus text must not take the inline-only path", () => {
  assert.equal(isInlineEligibleType("text/plain"), true);
  assert.equal(isInlineEligibleType("application/pdf"), false);
});

import { prisma } from "@/lib/prisma";
import { routeContext } from "@/lib/contextRouter";
import { RoutingDecision } from "@/types/chat";

test("missing scoped turn fails closed rather than borrowing the latest row", async () => {
  const calls: unknown[] = [];
  const originalLookup = prisma.message.findMany;
  Object.defineProperty(prisma.message, "findMany", { configurable: true, value: async (args: unknown) => {
    calls.push(args);
    return [];
  }});
  try {
    const result = await routeContext(
      [{ type: "text", text: "Hi" }, { type: "image_url", image_url: { url: image.fileUrl } }],
      "owner-1", [], "conversation-1", null, true, { currentMessageId: "missing-turn" },
    );
    assert.equal(calls.length, 1);
    assert.deepEqual((calls[0] as { where: { id: string } }).where.id, "missing-turn");
    assert.equal(result.metadata.documentContextState, "unavailable");
    assert.equal(result.metadata.routingDecision, RoutingDecision.Hybrid);
    assert.equal(result.metadata.skippedMemory, true);
    assert.match(result.context, /could not read all of the attached documents/);
  } finally {
    Object.defineProperty(prisma.message, "findMany", { configurable: true, value: originalLookup });
  }
});

test("referential lookback is limited to visible user message IDs", async () => {
  const calls: unknown[] = [];
  const originalLookup = prisma.message.findMany;
  Object.defineProperty(prisma.message, "findMany", { configurable: true, value: async (args: unknown) => {
    calls.push(args);
    return calls.length === 1 ? [{ attachments: [] }] : [];
  }});
  try {
    await routeContext(
      [{ type: "text", text: "Summarize the attached document" }, { type: "image_url", image_url: { url: image.fileUrl } }],
      "owner-1",
      [{ role: MessageRole.USER, id: "visible-one", content: "First turn" },
       { role: MessageRole.ASSISTANT, id: "assistant-one", content: "Reply" },
       { role: MessageRole.USER, id: "visible-two", content: "Second turn" }],
      "conversation-1", null, true, { currentMessageId: "current-turn" },
    );
    assert.equal(calls.length, 2);
    assert.equal((calls[0] as { where: { id: string } }).where.id, "current-turn");
    assert.deepEqual((calls[1] as { where: { id: { in: string[] } } }).where.id.in, ["visible-one", "visible-two"]);
    assert.deepEqual((calls[1] as { where: { conversation: { userId: string } } }).where.conversation.userId, "owner-1");
  } finally {
    Object.defineProperty(prisma.message, "findMany", { configurable: true, value: originalLookup });
  }
});

test("a persisted generic-MIME PDF with an image must fail closed, not route as vision-only", async () => {
  const originalLookup = prisma.message.findMany;
  Object.defineProperty(prisma.message, "findMany", { configurable: true, value: async () => [{ attachments: [
    { id: "image-id", fileType: "image/png", fileName: "photo.png", fileUrl: image.fileUrl },
    { id: "pdf-id", fileType: "application/octet-stream", fileName: "resume.pdf", fileUrl: pdf.fileUrl },
  ] }] });
  try {
    const result = await routeContext(
      [{ type: "text", text: "Hi" }, { type: "image_url", image_url: { url: image.fileUrl } }],
      "owner-1", [], "conversation-1", null, true, { currentMessageId: "current-turn" },
    );
    assert.equal(result.metadata.documentContextState, "unavailable");
    assert.equal(result.metadata.routingDecision, RoutingDecision.Hybrid);
    assert.match(result.context, /could not read all of the attached documents/);
  } finally {
    Object.defineProperty(prisma.message, "findMany", { configurable: true, value: originalLookup });
  }
});

test("current unsupported PDF does not borrow earlier visible PDF in a referential question", async () => {
  const calls: unknown[] = [];
  const originalLookup = prisma.message.findMany;
  Object.defineProperty(prisma.message, "findMany", { configurable: true, value: async (args: unknown) => {
    calls.push(args);
    return calls.length === 1
      ? [{ attachments: [{ id: "unreadable-pdf", fileType: "application/octet-stream", fileName: "resume.pdf", fileUrl: pdf.fileUrl }] }]
      : [{ attachments: [{ ...pdf }] }];
  } });
  try {
    const result = await routeContext(
      [{ type: "text", text: "Compare this attached PDF to the image" }, { type: "image_url", image_url: { url: image.fileUrl } }],
      "owner-1", [{ role: MessageRole.USER, id: "old-message", content: "Old file" }],
      "conversation-1", null, true, { currentMessageId: "current-turn" },
    );
    assert.equal(calls.length, 1);
    assert.equal(result.metadata.documentContextState, "unavailable");
  } finally {
    Object.defineProperty(prisma.message, "findMany", { configurable: true, value: originalLookup });
  }
});
