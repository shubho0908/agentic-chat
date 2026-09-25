import assert from "node:assert/strict";
import test from "node:test";
import { prisma } from "@/lib/prisma";
import { getScopedDocumentCoverage, formatRetrievedContext } from "@/lib/rag/retrieval/context";

test("missed query can use bounded owner-scoped coverage samples, not fake retrieval hits", async () => {
  const original = prisma.$queryRaw;
  const calls: unknown[] = [];
  Object.defineProperty(prisma, "$queryRaw", { configurable: true, value: async (query: unknown) => {
    calls.push(query);
    return [{ id: "pdf-id:0", content: "Software engineering experience", attachment_id: "pdf-id", file_name: "resume.pdf", page: 1, char_start: 0 }];
  } });
  try {
    const candidates = await getScopedDocumentCoverage("owner-1", "conversation-1", ["pdf-id"]);
    assert.equal(calls.length, 1);
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].metadata.attachmentId, "pdf-id");
    const output = formatRetrievedContext(candidates, "coverage");
    assert.match(output.context, /document_coverage_samples/);
    assert.match(output.context, /not query-retrieved evidence/);
    assert.equal(output.citations?.[0].relevance, "coverage-sample");
    assert.equal(output.citations?.[0].score, undefined);
  } finally {
    Object.defineProperty(prisma, "$queryRaw", { configurable: true, value: original });
  }
});

test("coverage rejects foreign or empty rows and never samples a document without its own chunk", async () => {
  const original = prisma.$queryRaw;
  Object.defineProperty(prisma, "$queryRaw", { configurable: true, value: async () => [
    { id: "foreign", content: "Private other person's file", attachment_id: "other-id", file_name: "other.pdf", page: 1, char_start: 0 },
    { id: "empty", content: "  ", attachment_id: "pdf-id", file_name: "resume.pdf", page: 1, char_start: 0 },
  ] });
  try {
    assert.deepEqual(await getScopedDocumentCoverage("owner-1", "conversation-1", ["pdf-id"]), []);
    assert.deepEqual(await getScopedDocumentCoverage("owner-1", "conversation-1", []), []);
  } finally {
    Object.defineProperty(prisma, "$queryRaw", { configurable: true, value: original });
  }
});

test("coverage requests two samples for each scoped document, even past five documents", async () => {
  const original = prisma.$queryRaw;
  let captured: unknown;
  Object.defineProperty(prisma, "$queryRaw", { configurable: true, value: async (query: unknown, ...values: unknown[]) => { captured = { query, values }; return []; } });
  try {
    await getScopedDocumentCoverage("owner-1", "conversation-1", Array.from({ length: 7 }, (_, i) => `pdf-${i}`));
    const sql = Array.from((captured as { query: TemplateStringsArray }).query).join(" ");
    assert.doesNotMatch(sql, /LIMIT 10\b/);
    assert.match(sql, /row_num <= 2/);
    assert.match(sql, /LIMIT\s*$/);
    const query = captured as unknown as { values: unknown[] };
    assert.equal(query.values[query.values.length - 1], 14);
  } finally {
    Object.defineProperty(prisma, "$queryRaw", { configurable: true, value: original });
  }
});

test("coverage returns a sample for each of seven indexed documents", async () => {
  const original = prisma.$queryRaw;
  const ids = Array.from({ length: 7 }, (_, i) => `pdf-${i}`);
  Object.defineProperty(prisma, "$queryRaw", { configurable: true, value: async () => ids.map((id) => ({
    id: `${id}:0`, content: `Evidence in ${id}`, attachment_id: id, file_name: `${id}.pdf`, page: 1, char_start: 0,
  })) });
  try {
    const samples = await getScopedDocumentCoverage("owner-1", "conversation-1", ids);
    assert.deepEqual(new Set(samples.map((sample) => sample.metadata.attachmentId)), new Set(ids));
    assert.equal(formatRetrievedContext(samples, "coverage").usedAttachmentIds.length, ids.length);
  } finally { Object.defineProperty(prisma, "$queryRaw", { configurable: true, value: original }); }
});
