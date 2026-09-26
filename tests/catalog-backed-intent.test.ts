import test from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { routeContext } from "@/lib/contextRouter";

const earlier = { id: "pdf-old", fileName: "cv.pdf", fileUrl: "https://utfs.io/f/cv", fileType: "application/pdf", fileSize: 200, kind: "document" };
const current = { id: "new-image", fileName: "quiz.png", fileUrl: "https://utfs.io/f/quiz", fileType: "image/png", fileSize: 100, kind: "image" };

test("attachment intent receives scoped historical catalog and can select an indirect reference", async () => {
  const first = prisma.message.findFirst, many = prisma.message.findMany, find = prisma.attachment.findMany, raw = prisma.$queryRaw;
  Object.defineProperty(prisma.message, "findFirst", { configurable: true, value: async (args: { select?: { attachments?: unknown } }) =>
    args.select?.attachments ? { id: "now", createdAt: new Date(), parentMessageId: null, attachments: [] } : { id: "old" } });
  Object.defineProperty(prisma.message, "findMany", { configurable: true, value: async () => [
    { id: "image", attachments: [current] }, { id: "old", attachments: [earlier] },
  ] });
  Object.defineProperty(prisma.attachment, "findMany", { configurable: true, value: async () => [{ id: earlier.id, fileName: earlier.fileName, chunkCount: 1 }] });
  Object.defineProperty(prisma, "$queryRaw", { configurable: true, value: async () => [{ id: "pdf-old:0", attachment_id: earlier.id, file_name: earlier.fileName, chunk_index: 0, page: 1, content: "Contact: sample@example.com" }] });
  const seen: string[][] = [];
  try {
    const result = await routeContext("Could you check whether his contact details are in that one?", "owner", [], "conv", null, false,
      { currentMessageId: "now", decideResources: async (input) => {
        seen.push(input.resources.map((resource) => resource.id));
        return input.phase === "intent" ? { state: "selected", ids: [] } : { state: "selected", ids: [earlier.id] };
      } });
    assert.deepEqual(seen[0], [current.id, earlier.id]);
    assert.deepEqual(result.metadata.documentEvidenceIds, [earlier.id]);
  } finally {
    Object.defineProperty(prisma.message, "findFirst", { configurable: true, value: first });
    Object.defineProperty(prisma.message, "findMany", { configurable: true, value: many });
    Object.defineProperty(prisma.attachment, "findMany", { configurable: true, value: find });
    Object.defineProperty(prisma, "$queryRaw", { configurable: true, value: raw });
  }
});

test("catalog read failure never yields an empty response path", async () => {
  const first = prisma.message.findFirst;
  Object.defineProperty(prisma.message, "findFirst", { configurable: true, value: async () => { throw new Error("read timeout"); } });
  try {
    const result = await routeContext("Does that one have contact details?", "owner", [], "conv", null, false,
      { currentMessageId: "now", decideResources: async () => ({ state: "none" }) });
    assert.equal(result.unresolved?.reason, "current-unverified");
  } finally {
    Object.defineProperty(prisma.message, "findFirst", { configurable: true, value: first });
  }
});

test("branch-scoped lookup never uses a sibling or pre-branch attachment", async () => {
  const first = prisma.message.findFirst, many = prisma.message.findMany;
  let historyReads = 0;
  Object.defineProperty(prisma.message, "findFirst", { configurable: true,
    value: async () => ({ id: "now", createdAt: new Date(), parentMessageId: "branch-parent", attachments: [] }) });
  Object.defineProperty(prisma.message, "findMany", { configurable: true,
    value: async () => { historyReads++; return [{ id: "sibling", attachments: [earlier] }]; } });
  try {
    const result = await routeContext("What is in that file?", "owner", [], "conv", null, false,
      { branchId: "branch-A", currentMessageId: "now", decideResources: async () => ({ state: "none" }) });
    assert.equal(historyReads, 0);
    assert.equal(result.metadata.documentEvidenceIds, undefined);
  } finally {
    Object.defineProperty(prisma.message, "findFirst", { configurable: true, value: first });
    Object.defineProperty(prisma.message, "findMany", { configurable: true, value: many });
  }
});

test("a concurrent deletion before catalog read becomes visible unresolved state", async () => {
  const first = prisma.message.findFirst, many = prisma.message.findMany;
  Object.defineProperty(prisma.message, "findFirst", { configurable: true, value: async () => null });
  Object.defineProperty(prisma.message, "findMany", { configurable: true, value: async () => [] });
  try {
    const result = await routeContext("What does the file say?", "owner", [], "conv", null, false,
      { currentMessageId: "now", decideResources: async () => ({ state: "selected", ids: [earlier.id] }) });
    assert.equal(result.unresolved?.reason, "current-unverified");
    assert.equal(result.metadata.documentEvidenceIds, undefined);
  } finally {
    Object.defineProperty(prisma.message, "findFirst", { configurable: true, value: first });
    Object.defineProperty(prisma.message, "findMany", { configurable: true, value: many });
  }
});

test("incomplete catalog cannot silently turn an unrelated question into no attachment state", async () => {
  const first = prisma.message.findFirst, many = prisma.message.findMany;
  Object.defineProperty(prisma.message, "findFirst", { configurable: true,
    value: async () => ({ id: "now", createdAt: new Date(), parentMessageId: null, attachments: [] }) });
  Object.defineProperty(prisma.message, "findMany", { configurable: true, value: async () =>
    Array.from({ length: 251 }, (_, index) => ({ id: `old-${index}`, attachments: [earlier] })) });
  try {
    const result = await routeContext("What is recursion?", "owner", [], "conv", null, false,
      { currentMessageId: "now", decideResources: async () => ({ state: "none" }) });
    assert.equal(result.unresolved?.reason, "ambiguous");
    assert.equal(result.metadata.documentEvidenceIds, undefined);
  } finally {
    Object.defineProperty(prisma.message, "findFirst", { configurable: true, value: first });
    Object.defineProperty(prisma.message, "findMany", { configurable: true, value: many });
  }
});

test("invalid selected IDs never become an unrelated answer on an indirect reference", async () => {
  const first = prisma.message.findFirst, many = prisma.message.findMany;
  Object.defineProperty(prisma.message, "findFirst", { configurable: true,
    value: async () => ({ id: "now", createdAt: new Date(), parentMessageId: null, attachments: [] }) });
  Object.defineProperty(prisma.message, "findMany", { configurable: true, value: async () => [{ id: "old", attachments: [earlier] }] });
  try {
    const result = await routeContext("Could you check that one?", "owner", [], "conv", null, false,
      { currentMessageId: "now", decideResources: async (input) => input.phase === "intent"
        ? { state: "selected", ids: [] } : { state: "selected", ids: ["foreign-file"] } });
    assert.equal(result.unresolved?.reason, "ambiguous");
    assert.equal(result.metadata.documentEvidenceIds, undefined);
  } finally {
    Object.defineProperty(prisma.message, "findFirst", { configurable: true, value: first });
    Object.defineProperty(prisma.message, "findMany", { configurable: true, value: many });
  }
});

test("a missing historical file after selection cannot be presented as read evidence", async () => {
  const first = prisma.message.findFirst, many = prisma.message.findMany;
  const find = prisma.attachment.findMany, raw = prisma.$queryRaw;
  Object.defineProperty(prisma.message, "findFirst", { configurable: true,
    value: async () => ({ id: "now", createdAt: new Date(), parentMessageId: null, attachments: [] }) });
  Object.defineProperty(prisma.message, "findMany", { configurable: true, value: async () => [{ id: "old", attachments: [earlier] }] });
  Object.defineProperty(prisma.attachment, "findMany", { configurable: true, value: async () => [] });
  Object.defineProperty(prisma, "$queryRaw", { configurable: true, value: async () => [] });
  try {
    const result = await routeContext("Is his contact information in that one?", "owner", [], "conv", null, false,
      { currentMessageId: "now", decideResources: async (input) => input.phase === "intent"
        ? { state: "selected", ids: [] } : { state: "selected", ids: [earlier.id] } });
    assert.equal(result.metadata.documentEvidenceIds, undefined);
    assert.equal(result.metadata.documentContextState, "unavailable");
    assert.ok(result.unresolved?.prompt || result.context.includes("document_processing_notice"));
  } finally {
    Object.defineProperty(prisma.message, "findFirst", { configurable: true, value: first });
    Object.defineProperty(prisma.message, "findMany", { configurable: true, value: many });
    Object.defineProperty(prisma.attachment, "findMany", { configurable: true, value: find });
    Object.defineProperty(prisma, "$queryRaw", { configurable: true, value: raw });
  }
});

test("selected document content unavailable terminates visibly, not through an answer model", async () => {
  const first = prisma.message.findFirst, many = prisma.message.findMany;
  const find = prisma.attachment.findMany, raw = prisma.$queryRaw;
  Object.defineProperty(prisma.message, "findFirst", { configurable: true,
    value: async () => ({ id: "now", createdAt: new Date(), parentMessageId: null, attachments: [] }) });
  Object.defineProperty(prisma.message, "findMany", { configurable: true, value: async () => [{ id: "old", attachments: [earlier] }] });
  Object.defineProperty(prisma.attachment, "findMany", { configurable: true, value: async () => [] });
  Object.defineProperty(prisma, "$queryRaw", { configurable: true, value: async () => [] });
  try {
    const result = await routeContext("Is his contact information in that one?", "owner", [], "conv", null, false,
      { currentMessageId: "now", decideResources: async (input) => input.phase === "intent"
        ? { state: "selected", ids: [] } : { state: "selected", ids: [earlier.id] } });
    assert.equal(result.unresolved?.reason, "retrieval-unavailable");
  } finally {
    Object.defineProperty(prisma.message, "findFirst", { configurable: true, value: first });
    Object.defineProperty(prisma.message, "findMany", { configurable: true, value: many });
    Object.defineProperty(prisma.attachment, "findMany", { configurable: true, value: find });
    Object.defineProperty(prisma, "$queryRaw", { configurable: true, value: raw });
  }
});

test("an image deleted between catalog and model input becomes visible unresolved state", async () => {
  const first = prisma.message.findFirst, many = prisma.message.findMany, find = prisma.attachment.findMany;
  Object.defineProperty(prisma.message, "findFirst", { configurable: true,
    value: async () => ({ id: "now", createdAt: new Date(), parentMessageId: null, attachments: [] }) });
  Object.defineProperty(prisma.message, "findMany", { configurable: true,
    value: async () => [{ id: "old", attachments: [current] }] });
  Object.defineProperty(prisma.attachment, "findMany", { configurable: true, value: async () => [] });
  try {
    const result = await routeContext("Describe the image I sent", "owner", [], "conv", null, false,
      { currentMessageId: "now", decideResources: async (input) => input.phase === "intent"
        ? { state: "selected", ids: [] } : { state: "selected", ids: [current.id] } });
    assert.equal(result.unresolved?.reason, "retrieval-unavailable");
    assert.equal(result.metadata.historicalImageFiles, undefined);
  } finally {
    Object.defineProperty(prisma.message, "findFirst", { configurable: true, value: first });
    Object.defineProperty(prisma.message, "findMany", { configurable: true, value: many });
    Object.defineProperty(prisma.attachment, "findMany", { configurable: true, value: find });
  }
});

test("a failed classifier still routes an explicit single current PDF without guessing from history", async () => {
  const first = prisma.message.findFirst, many = prisma.message.findMany, find = prisma.attachment.findMany, raw = prisma.$queryRaw;
  const attached = { ...earlier, id: "current-pdf", fileName: "new.pdf" };
  Object.defineProperty(prisma.message, "findFirst", { configurable: true,
    value: async () => ({ id: "now", createdAt: new Date(), parentMessageId: null, attachments: [attached] }) });
  Object.defineProperty(prisma.message, "findMany", { configurable: true,
    value: async () => [{ id: "old", attachments: [earlier] }] });
  Object.defineProperty(prisma.attachment, "findMany", { configurable: true,
    value: async () => [{ id: attached.id, fileName: attached.fileName, chunkCount: 1 }] });
  Object.defineProperty(prisma, "$queryRaw", { configurable: true,
    value: async () => [{ id: "current-pdf:0", attachment_id: attached.id, file_name: attached.fileName,
      chunk_index: 0, page: 1, content: "Only the current PDF" }] });
  try {
    const result = await routeContext("What does this PDF say?", "owner", [], "conv", null, false,
      { currentMessageId: "now", decideResources: async () => { throw new Error("classifier timeout"); } });
    assert.deepEqual(result.metadata.documentEvidenceIds, [attached.id]);
    assert.match(result.context, /Only the current PDF/);
    const old = await routeContext("What does the earlier PDF say?", "owner", [], "conv", null, false,
      { currentMessageId: "now", decideResources: async () => { throw new Error("classifier timeout"); } });
    assert.equal(old.unresolved?.reason, "ambiguous");
  } finally {
    Object.defineProperty(prisma.message, "findFirst", { configurable: true, value: first });
    Object.defineProperty(prisma.message, "findMany", { configurable: true, value: many });
    Object.defineProperty(prisma.attachment, "findMany", { configurable: true, value: find });
    Object.defineProperty(prisma, "$queryRaw", { configurable: true, value: raw });
  }
});

test("classifier failure cannot answer from only one of two requested current files", async () => {
  const first = prisma.message.findFirst, many = prisma.message.findMany;
  const doc = { ...earlier, id: "current-pdf", fileName: "current.pdf" };
  const image = { ...current, id: "current-image", fileName: "current.png" };
  Object.defineProperty(prisma.message, "findFirst", { configurable: true,
    value: async () => ({ id: "now", createdAt: new Date(), parentMessageId: null, attachments: [doc, image] }) });
  Object.defineProperty(prisma.message, "findMany", { configurable: true, value: async () => [] });
  try {
    for (const query of ["What is in this file and this image?", "Compare current.pdf with current.png"]) {
      const result = await routeContext(query, "owner", [], "conv", null, false,
        { currentMessageId: "now", decideResources: async () => { throw new Error("classifier timeout"); } });
      assert.equal(result.unresolved?.reason, "ambiguous");
      assert.equal(result.metadata.documentEvidenceIds, undefined);
      assert.equal(result.metadata.historicalImageFiles, undefined);
    }
  } finally {
    Object.defineProperty(prisma.message, "findFirst", { configurable: true, value: first });
    Object.defineProperty(prisma.message, "findMany", { configurable: true, value: many });
  }
});
