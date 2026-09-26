import test from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { routeContext } from "@/lib/contextRouter";
import { MessageRole } from "@/lib/schemas/chat";

const pdf = { id: "resume-pdf", fileName: "resume.pdf", fileUrl: "https://utfs.io/f/resume", fileType: "application/pdf", fileSize: 300, kind: "document" };
const image = { id: "quiz-image", fileName: "quiz.png", fileUrl: "https://utfs.io/f/quiz", fileType: "image/png", fileSize: 300, kind: "image" };
const question = "PDF mein bande ka email ID aur phone number hai kya?";

async function withPriorAttachments(run: (calls: string[]) => Promise<void>, documents = [pdf]) {
  const first = prisma.message.findFirst, many = prisma.message.findMany;
  const find = prisma.attachment.findMany, raw = prisma.$queryRaw;
  const calls: string[] = [];
  Object.defineProperty(prisma.message, "findFirst", { configurable: true, value: async (args: { select?: { attachments?: unknown; createdAt?: unknown } }) =>
    args.select?.attachments ? { id: "now", createdAt: new Date(), parentMessageId: null, attachments: [] } :
    args.select?.createdAt ? { id: "now", createdAt: new Date(), parentMessageId: null, attachments: [] } : { id: "older-pdf" } });
  Object.defineProperty(prisma.message, "findMany", { configurable: true, value: async () => {
    calls.push("history");
    return [{ id: "older-image", attachments: [image] }, { id: "older-pdf", attachments: documents }];
  } });
  Object.defineProperty(prisma.attachment, "findMany", { configurable: true, value: async () => documents.map((doc) => ({ id: doc.id, fileName: doc.fileName, chunkCount: 1 })) });
  Object.defineProperty(prisma, "$queryRaw", { configurable: true, value: async () => documents.map((doc) => ({ id: `${doc.id}:0`, attachment_id: doc.id, file_name: doc.fileName, chunk_index: 0, page: 1, content: "Contact: sample@example.com, +1 555 0100" })) });
  try { await run(calls); } finally {
    Object.defineProperty(prisma.message, "findFirst", { configurable: true, value: first });
    Object.defineProperty(prisma.message, "findMany", { configurable: true, value: many });
    Object.defineProperty(prisma.attachment, "findMany", { configurable: true, value: find });
    Object.defineProperty(prisma, "$queryRaw", { configurable: true, value: raw });
  }
}

const recent = [
  { role: MessageRole.USER, content: "Earlier PDF upload" },
  { role: MessageRole.ASSISTANT, content: "PDF summary" },
  { role: MessageRole.USER, content: "Image upload" },
  { role: MessageRole.ASSISTANT, content: "Image answer" },
  { role: MessageRole.USER, content: "Unrelated chat" },
  { role: MessageRole.ASSISTANT, content: "Unrelated answer" },
  { role: MessageRole.USER, content: "Compare image and PDF" },
  { role: MessageRole.ASSISTANT, content: "Comparison table" },
];

test("explicit historical-PDF contact question recovers a unique PDF when intent fails", async () => {
  await withPriorAttachments(async (calls) => {
    const result = await routeContext(question, "owner", recent, "conv", null, false,
      { currentMessageId: "now", decideResources: async () => { throw new Error("unsupported JSON mode"); } });
    assert.ok(calls.includes("history"));
    assert.deepEqual(result.metadata.documentEvidenceIds, [pdf.id]);
    assert.match(result.context, /sample@example.com/);
  });
});

test("explicit historical-PDF contact question recovers a unique PDF when intent says none", async () => {
  await withPriorAttachments(async () => {
    const result = await routeContext(question, "owner", recent, "conv", null, false,
      { currentMessageId: "now", decideResources: async () => ({ state: "none" }) });
    assert.deepEqual(result.metadata.documentEvidenceIds, [pdf.id]);
  });
});

test("multiple PDFs never silently choose one when classification fails", async () => {
  await withPriorAttachments(async () => {
    const result = await routeContext(question, "owner", recent, "conv", null, false,
      { currentMessageId: "now", decideResources: async () => { throw new Error("unavailable"); } });
    assert.equal(result.metadata.documentEvidenceIds, undefined);
    assert.match(result.context, /document_processing_notice/);
  }, [pdf, { ...pdf, id: "second-pdf", fileName: "another.pdf" }]);
});

test("explicit reference to current PDF survives classifier failure", async () => {
  const first = prisma.message.findFirst;
  Object.defineProperty(prisma.message, "findFirst", { configurable: true, value: async (args: { select?: { attachments?: unknown; createdAt?: unknown } }) =>
    args.select?.attachments || args.select?.createdAt ? { id: "now", createdAt: new Date(), parentMessageId: null, attachments: [pdf] } : null });
  const find = prisma.attachment.findMany, raw = prisma.$queryRaw;
  Object.defineProperty(prisma.attachment, "findMany", { configurable: true, value: async () => [{ id: pdf.id, fileName: pdf.fileName, chunkCount: 1 }] });
  Object.defineProperty(prisma, "$queryRaw", { configurable: true, value: async () => [{ id: `${pdf.id}:0`, attachment_id: pdf.id, file_name: pdf.fileName, chunk_index: 0, page: 1, content: "Contact: sample@example.com" }] });
  try {
    const result = await routeContext(question, "owner", [], "conv", null, false,
      { currentMessageId: "now", decideResources: async () => { throw new Error("model unavailable"); } });
    assert.deepEqual(result.metadata.documentEvidenceIds, [pdf.id]);
  } finally {
    Object.defineProperty(prisma.message, "findFirst", { configurable: true, value: first });
    Object.defineProperty(prisma.attachment, "findMany", { configurable: true, value: find });
    Object.defineProperty(prisma, "$queryRaw", { configurable: true, value: raw });
  }
});
