import test from "node:test";
import assert from "node:assert/strict";
import {
  selectConversationResource,
  type ResourceCandidate,
} from "@/lib/chat/resourceSelection";
const resource = (
  id: string,
  kind: "document" | "snippet" | "image",
  current = false,
  messageId = id,
): ResourceCandidate => ({
  id,
  kind,
  current,
  messageId,
  fileName: `${id}.${kind === "image" ? "png" : "pdf"}`,
  fileUrl: `https://utfs.io/f/${id}`,
  fileType: kind === "image" ? "image/png" : "application/pdf",
  fileSize: 100,
});
const chosen = (
  text: string,
  candidates: ResourceCandidate[],
  currentImage = false,
) => selectConversationResource(text, currentImage, candidates);
test("one old document survives arbitrarily many later turns, but two unrelated old documents need clarification", () => {
  assert.deepEqual(
    chosen("Summarize the document I sent earlier", [
      resource("old", "document"),
    ]),
    {
      state: "selected",
      kind: "document",
      resources: [resource("old", "document")],
    },
  );
  assert.equal(
    chosen("Summarize the earlier document", [
      resource("old", "document"),
      resource("older", "document"),
    ]).state,
    "ambiguous",
  );
  assert.deepEqual(
    chosen("Summarize old.pdf", [
      resource("old", "document"),
      resource("older", "document"),
    ]),
    {
      state: "selected",
      kind: "document",
      resources: [resource("old", "document")],
    },
  );
});
test("prior image wins over unrelated current PDF while text-only photo memory is not attachment context", () => {
  assert.deepEqual(
    chosen("Describe this image", [
      resource("old", "image"),
      resource("new", "document", true),
    ]),
    {
      state: "selected",
      kind: "image",
      resources: [resource("old", "image")],
    },
  );
  assert.equal(
    chosen("What do you remember about my photos?", []).state,
    "none",
  );
});
test("current and older typed resources resolve without crossing kinds", () => {
  const old = resource("old", "document");
  const now = resource("now", "document", true);
  assert.deepEqual(chosen("What is in this document?", [old, now]), {
    state: "selected",
    kind: "document",
    resources: [now],
  });
  assert.deepEqual(chosen("What was in that earlier document?", [old, now]), {
    state: "selected",
    kind: "document",
    resources: [old],
  });
  assert.equal(
    chosen("Summarize this file", [resource("s", "snippet")]).state,
    "selected",
  );
  assert.equal(
    chosen("Summarize this file", [resource("s", "snippet"), now]).state,
    "selected",
  );
  assert.equal(
    chosen("Summarize this file", [resource("s", "snippet", true), now]).state,
    "ambiguous",
  );
});

test("explicit old image and current PDF comparison retains both typed sources", () => {
  const result = chosen("Compare the earlier image with this PDF", [
    resource("old", "image"), resource("now", "document", true),
  ]);
  assert.equal(result.state, "selected");
  if (result.state === "selected") {
    assert.deepEqual(result.resources.map((candidate) => candidate.id), ["now"]);
    assert.deepEqual(result.images?.map((candidate) => candidate.id), ["old"]);
  }
  assert.equal(chosen("Compare the image with the PDF", [
    resource("older", "image"), resource("old", "image"), resource("now", "document", true),
  ]).state, "ambiguous");
});
test("duplicate attachment names on separate turns are ambiguous even if current matches", () => {
  assert.equal(chosen("Read report.pdf", [
    { ...resource("a", "document"), fileName: "report.pdf" },
    { ...resource("b", "document", true), fileName: "report.pdf" },
  ]).state, "ambiguous");
});

test("non-referential prose does not drag an older file into a new question", () => {
  assert.equal(chosen("What is a PDF?", [resource("old", "document")]).state, "none");
  assert.equal(chosen("How do image compression formats work?", [resource("old", "image")]).state, "none");
  assert.equal(chosen("What is an attachment in email?", [resource("old", "document")]).state, "none");
});

test("an old resource requested by exact filename resolves without generic attachment wording", () => {
  const candidate = { ...resource("old", "document"), fileName: "lease-2025.pdf" };
  const result = chosen("What does lease-2025.pdf say?", [candidate]);
  assert.equal(result.state, "selected");
  if (result.state === "selected") assert.deepEqual(result.resources, [candidate]);
});

test("current mixed image and document use both even for a short caption", () => {
  const result = chosen("Hi", [resource("img", "image", true, "turn"), resource("pdf", "document", true, "turn")], true);
  assert.equal(result.state, "selected");
  if (result.state === "selected") assert.deepEqual(result.resources.map((item) => item.id), ["pdf"]);
});

test("multiple current attachments of one type stay in the same selected batch", () => {
  const sameTurn = [resource("one", "document", true, "now"), resource("two", "document", true, "now")];
  const result = chosen("Summarize these documents", sameTurn);
  assert.equal(result.state, "selected");
  if (result.state === "selected") assert.deepEqual(result.resources.map((candidate) => candidate.id), ["one", "two"]);
});

test("generic current image plus snippet does not silently drop one resource", () => {
  const result = chosen("Hi", [resource("img", "image", true, "now"), resource("paste", "snippet", true, "now")], true);
  assert.equal(result.state, "ambiguous");
});

test("an explicit old PDF should not select an unrelated current PDF", () => {
  assert.equal(chosen("Read the earlier PDF", [resource("current", "document", true)]).state, "none");
});
