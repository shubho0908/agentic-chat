import assert from "node:assert/strict";
import { test } from "node:test";
import {
  allDocumentsReady,
  buildRetrievalQueries,
  isInlineEligibleType,
  shouldSkipTextContextForImage,
} from "@/lib/contextRouter";
import { selectDocumentAttachmentsForTurn } from "@/lib/chat/attachmentRouting";
import { buildMultimodalContent } from "@/lib/contentUtils";
import { MessageRole } from "@/lib/schemas/chat";

const image: {
  id?: string;
  fileUrl: string;
  fileName: string;
  fileType: string;
  fileSize: number;
} = {
  fileUrl: "https://example.com/photo.png",
  fileName: "photo.png",
  fileType: "image/png",
  fileSize: 12,
};
const pdf = {
  id: "pdf-id",
  fileUrl: "https://example.com/one.pdf",
  fileName: "one.pdf",
  fileType: "application/pdf",
  fileSize: 12,
};
const secondPdf = { ...pdf, id: "pdf-two", fileName: "two.pdf" };

test("mixed image and documents retain vision parts and both document IDs", () => {
  const attachments = [image, pdf, secondPdf];
  const content = buildMultimodalContent("Hi", attachments);
  assert.ok(Array.isArray(content));
  assert.equal(content.filter((part) => part.type === "image_url").length, 1);
  assert.deepEqual(
    selectDocumentAttachmentsForTurn([{ attachments }], false).map((a) => a.id),
    ["pdf-id", "pdf-two"],
  );
  assert.equal(shouldSkipTextContextForImage(true, "Hi", true), false);
  assert.equal(shouldSkipTextContextForImage(true, "", true), false);
  assert.equal(shouldSkipTextContextForImage(true, "Hi", false), true);
});

test("image plus document without a caption still generates a RAG query", () => {
  assert.deepEqual(buildRetrievalQueries("", [], false), [
    "Summarize the attached documents.",
  ]);
  assert.ok(
    buildRetrievalQueries(
      "Hi",
      [{ role: MessageRole.USER, content: "Previous turn" }],
      false,
    ).length > 0,
  );
});

test("a batch is ready only when every expected document finished indexing", () => {
  const five = ["a", "b", "c", "d", "e"];
  const complete = five.map((id) => ({ id, processingStatus: "COMPLETED" }));
  assert.equal(allDocumentsReady(five, complete), true);
  assert.equal(allDocumentsReady(five, complete.slice(0, 4)), false);
  assert.equal(
    allDocumentsReady(five, [
      ...complete.slice(0, 4),
      { id: "e", processingStatus: "FAILED" },
    ]),
    false,
  );
  assert.equal(
    allDocumentsReady(five, [
      ...complete.slice(0, 4),
      { id: "other", processingStatus: "COMPLETED" },
    ]),
    false,
  );
  assert.equal(allDocumentsReady([], []), false);
});

test("mixed PDF plus text must not take the inline-only path", () => {
  assert.equal(isInlineEligibleType("text/plain"), true);
  assert.equal(isInlineEligibleType("application/pdf"), false);
});
