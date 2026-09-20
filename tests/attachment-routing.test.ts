import test from "node:test";
import assert from "node:assert/strict";

import { selectDocumentAttachmentsForTurn } from "@/lib/chat/attachmentRouting";

const pdf = { id: "pdf", fileUrl: "https://example.com/a.pdf", fileName: "a.pdf", fileType: "application/pdf", fileSize: 10 };

test("unrelated later turns do not inherit old document attachments", () => {
  assert.deepEqual(selectDocumentAttachmentsForTurn([{ attachments: [pdf] }, { attachments: [] }], false), []);
});

test("referential follow-ups may retrieve conversation documents", () => {
  assert.deepEqual(selectDocumentAttachmentsForTurn([{ attachments: [pdf] }, { attachments: [] }], true).map((attachment) => attachment.id), ["pdf"]);
});
