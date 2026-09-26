import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ContextCards } from "@/components/chat/aiThinkingAnimation/contextCards";
import type { Attachment } from "@/lib/schemas/chat";
import { RoutingDecision, type MemoryStatus } from "@/types/chat";

const doc = (id: string): Attachment => ({
  id,
  fileName: `${id}.pdf`,
  fileUrl: `https://example.com/${id}.pdf`,
  fileType: "application/pdf",
  fileSize: 100,
});
const image: Attachment = {
  id: "image",
  fileName: "scene.png",
  fileUrl: "https://example.com/scene.png",
  fileType: "image/png",
  fileSize: 100,
};
const base: MemoryStatus = {
  hasMemories: false,
  hasDocuments: true,
  hasImages: false,
  memoryCount: 0,
  documentCount: 1,
  imageCount: 0,
  routingDecision: RoutingDecision.DocumentsOnly,
  documentContextState: "ready",
};
const render = (status: MemoryStatus, attachments: Attachment[]) =>
  renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client: new QueryClient() },
      createElement(ContextCards, {
        memoryStatus: status,
        attachments,
        defaultExpanded: true,
      }),
    ),
  );

test("card shows a document preview only when the persisted source identity matches", () => {
  const matching = render(
    {
      ...base,
      documentEvidenceFiles: [
        { id: "persisted-old", fileUrl: doc("old").fileUrl },
      ],
      documentEvidenceIds: ["persisted-old"],
    },
    [doc("old")],
  );
  assert.match(matching, /old\.pdf/);
  assert.match(matching, /Relevant passages used/);

  const wrongSameCount = render(
    {
      ...base,
      documentEvidenceFiles: [
        { id: "persisted-old", fileUrl: doc("old").fileUrl },
      ],
      documentEvidenceIds: ["persisted-old"],
    },
    [doc("new")],
  );
  assert.match(wrongSameCount, /File preview is not available/);
  assert.doesNotMatch(wrongSameCount, /new\.pdf|old\.pdf/);
});

test("mixed referential context never labels a latest-turn document as the older source", () => {
  const html = render(
    {
      ...base,
      hasImages: true,
      imageCount: 1,
      routingDecision: RoutingDecision.Hybrid,
      documentEvidenceFiles: [
        { id: "persisted-old", fileUrl: doc("old").fileUrl },
      ],
      documentEvidenceIds: ["persisted-old"],
    },
    [image, doc("new")],
  );
  assert.match(html, /scene\.png/);
  assert.match(html, /1 document preview unavailable/);
  assert.doesNotMatch(html, /new\.pdf|Relevant passages used/);
});

test("mismatched counts and duplicate URLs do not attribute passages to another file", () => {
  const source = { id: "persisted-old", fileUrl: doc("old").fileUrl };
  const twoSources = {
    ...base,
    documentCount: 2,
    documentEvidenceFiles: [
      source,
      { id: "other", fileUrl: doc("other").fileUrl },
    ],
    documentEvidenceIds: ["persisted-old"],
  };
  const mismatch = render(twoSources, [doc("old")]);
  assert.match(mismatch, /old\.pdf/);
  assert.match(mismatch, /1 document preview unavailable/);

  const duplicate = render(
    {
      ...twoSources,
      documentEvidenceFiles: [source, { id: "other", fileUrl: source.fileUrl }],
    },
    [doc("old"), doc("old")],
  );
  assert.match(duplicate, /File previews are not available/);
  assert.doesNotMatch(duplicate, /Relevant passages used/);
});

test("legacy status without source identities refuses to infer preview matches from counts", () => {
  const html = render(base, [doc("new")]);
  assert.match(html, /File preview is not available/);
  assert.doesNotMatch(html, /new\.pdf/);
});

test("multiple attachments use direct tiles without a pager or navigation buttons", () => {
  const html = render(
    {
      ...base,
      hasImages: true,
      imageCount: 1,
      documentCount: 2,
      routingDecision: RoutingDecision.Hybrid,
      documentEvidenceFiles: [
        { id: "persisted-one", fileUrl: doc("one").fileUrl },
        { id: "persisted-two", fileUrl: doc("two").fileUrl },
      ],
      documentEvidenceIds: ["persisted-one", "persisted-two"],
    },
    [image, doc("one"), doc("two")],
  );
  assert.match(html, /scene\.png/);
  assert.match(html, /one\.pdf/);
  assert.match(html, /two\.pdf/);
  assert.doesNotMatch(
    html,
    /aria-label="Previous file"|aria-label="Next file"|>1 \/ 3<|>2 \/ 3<|>3 \/ 3</,
  );
});

test("current image preview remains usable when referenced document is from an earlier turn", () => {
  const html = render(
    {
      ...base,
      hasImages: true,
      imageCount: 1,
      routingDecision: RoutingDecision.Hybrid,
      documentEvidenceFiles: [{ id: "old", fileUrl: doc("old").fileUrl }],
      documentEvidenceIds: ["old"],
    },
    [image],
  );
  assert.match(html, /scene\.png/);
  assert.match(html, /1 document preview unavailable/);
  assert.doesNotMatch(html, /old\.pdf|Relevant passages used/);
});

test("snippet status only displays snippet tiles, not an ordinary text document with the same MIME", () => {
  const pasted: Attachment = {
    id: "paste",
    fileName: "pasted-text-1.txt",
    fileUrl: "https://example.com/paste",
    fileType: "text/plain",
    fileSize: 25,
    kind: "snippet",
  };
  const ordinary: Attachment = {
    id: "ordinary",
    fileName: "notes.txt",
    fileUrl: "https://example.com/notes",
    fileType: "text/plain",
    fileSize: 25,
    kind: "document",
  };
  const html = render(
    {
      ...base,
      attachmentContextKind: "snippet",
      documentEvidenceFiles: [{ id: "paste", fileUrl: pasted.fileUrl }],
      documentEvidenceIds: ["paste"],
    },
    [pasted, ordinary],
  );
  assert.match(html, /pasted-text-1\.txt|snippet attached/i);
  assert.doesNotMatch(html, /notes\.txt/);
});

test("a historical image never makes an unrelated current image look like the selected preview", () => {
  const html = render(
    {
      ...base,
      hasDocuments: false,
      documentCount: 0,
      hasImages: true,
      imageCount: 1,
      routingDecision: RoutingDecision.VisionOnly,
      historicalImageFiles: [{ id: "old-image", fileUrl: image.fileUrl }],
    },
    [image],
  );
  assert.doesNotMatch(html, /scene\.png/);
  assert.match(html, /File preview is not available/);
});
