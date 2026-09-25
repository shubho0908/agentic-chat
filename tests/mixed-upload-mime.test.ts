import assert from "node:assert/strict";
import test from "node:test";
import { uploadResponsesToAttachments } from "@/lib/attachmentUtils";
import { buildMultimodalContent } from "@/lib/contentUtils";
import { isSupportedForRAG } from "@/lib/rag/utils";
import { selectDocumentAttachmentsForTurn } from "@/lib/chat/attachmentRouting";

test("a generic MIME resume PDF beside an image is still indexed as a PDF", () => {
  const files = uploadResponsesToAttachments([
    { name: "scene.png", ufsUrl: "https://example.com/scene.png", type: "image/png", size: 500 },
    { name: "Shubhojeet_Bera_Resume.pdf", ufsUrl: "https://example.com/resume.pdf", type: "application/octet-stream", size: 295000 },
  ]);
  assert.equal(files[1].fileType, "application/pdf");
  assert.ok(isSupportedForRAG(files[1].fileType));
  const content = buildMultimodalContent("Ye dono attachment mein koi similarity hai kya?", files);
  assert.ok(Array.isArray(content));
  assert.equal(content.filter((part) => part.type === "image_url").length, 1);
  assert.equal(selectDocumentAttachmentsForTurn([{ attachments: files }], false).length, 1);
});

test("generic MIME for a document without a supported extension stays generic", () => {
  const [file] = uploadResponsesToAttachments([{ name: "unknown.bin", ufsUrl: "https://example.com/unknown.bin", type: "application/octet-stream" }]);
  assert.equal(file.fileType, "application/octet-stream");
  assert.equal(isSupportedForRAG(file.fileType), false);
});
