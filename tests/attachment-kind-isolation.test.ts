import assert from "node:assert/strict";
import test from "node:test";
import {
  attachmentKind,
  nextSnippetFileName,
  requestedAttachmentKind,
} from "@/lib/chat/attachmentKind";
import { filterDocumentAttachments as filterRagDocuments } from "@/lib/rag/retrieval/statusHelpers";
import {
  filterDocumentAttachments,
  filterImageAttachments,
} from "@/lib/attachmentUtils";
import { selectDocumentAttachmentsForTurn } from "@/lib/chat/attachmentRouting";
import { validateAttachmentInputs } from "@/lib/validation";

const image = {
  id: "image",
  fileUrl: "https://example.com/img.png",
  fileName: "img.png",
  fileType: "image/png",
  fileSize: 1,
  kind: "image" as const,
};
const document = {
  id: "document",
  fileUrl: "https://example.com/doc.txt",
  fileName: "doc.txt",
  fileType: "text/plain",
  fileSize: 1,
  kind: "document" as const,
};
const snippet = {
  id: "snippet",
  fileUrl: "https://example.com/pasted-text-1.txt",
  fileName: "pasted-text-1.txt",
  fileType: "text/plain",
  fileSize: 1,
  kind: "snippet" as const,
};

test("typed attachment channels partition the same MIME without filename guesses", () => {
  const all = [image, document, snippet];
  assert.deepEqual(
    filterImageAttachments(all).map((a) => a.id),
    ["image"],
  );
  assert.deepEqual(
    filterDocumentAttachments(all).map((a) => a.id),
    ["document"],
  );
  assert.deepEqual(
    filterRagDocuments(all).map((a) => a.id),
    ["document"],
  );
  assert.deepEqual(
    filterRagDocuments(all, "snippet").map((a) => a.id),
    ["snippet"],
  );
  assert.deepEqual(
    selectDocumentAttachmentsForTurn([{ attachments: all }], false).map(
      (a) => a.id,
    ),
    ["document"],
  );
  assert.equal(attachmentKind({ fileType: "text/plain" }), "document");
});

test("explicit type requests route only to that channel and ambiguous document/snippet asks fail closed", () => {
  assert.equal(
    requestedAttachmentKind("Describe this image", true, true, true),
    "image",
  );
  assert.equal(
    requestedAttachmentKind("Summarize this document", true, true, true),
    "document",
  );
  assert.equal(
    requestedAttachmentKind("Summarize this snippet", true, true, true),
    "snippet",
  );
  assert.equal(
    requestedAttachmentKind(
      "Compare the document with pasted text",
      true,
      true,
      true,
    ),
    "ambiguous",
  );
  assert.equal(
    requestedAttachmentKind("What about this?", false, true, true),
    "ambiguous",
  );
});

test("three pasted snippets get distinct numbered names", () => {
  assert.deepEqual([1, 2, 3].map(nextSnippetFileName), [
    "pasted-text-1.txt",
    "pasted-text-2.txt",
    "pasted-text-3.txt",
  ]);
  assert.throws(() => nextSnippetFileName(0), RangeError);
});

test("rejects inconsistent client kind and MIME pairs at persistence boundary", () => {
  for (const [kind, fileType] of [
    ["image", "application/pdf"],
    ["document", "image/png"],
    ["snippet", "image/png"],
    ["snippet", "application/pdf"],
  ]) {
    const result = validateAttachmentInputs([
      {
        fileUrl: "https://utfs.io/f/uploaded",
        fileName: "test",
        fileType,
        fileSize: 1,
        kind,
      },
    ]);
    assert.equal(
      result.valid,
      false,
      `${kind}/${fileType} must not cross channels`,
    );
  }
});
