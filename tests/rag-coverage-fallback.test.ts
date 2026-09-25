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
