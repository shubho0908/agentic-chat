import test from "node:test";
import assert from "node:assert/strict";
import {
  reciprocalRankFuse,
  type RetrievalCandidate,
} from "@/lib/rag/retrieval/hybrid";
import { evaluateRetrieval } from "@/lib/rag/evaluation";
import { formatRetrievedContext } from "@/lib/rag/retrieval/context";
import { shouldKeepPassage } from "@/lib/jev/passageGate";
const c = (id: string, score = 1): RetrievalCandidate => ({
  content: id,
  score,
  metadata: { attachmentId: "a", fileName: "doc.pdf", chunkId: id },
});
test("RRF rewards agreement across semantic, lexical, and query variants", () => {
  const fused = reciprocalRankFuse([
    [c("a"), c("shared")],
    [c("shared"), c("b")],
    [c("c"), c("shared")],
  ]);
  assert.equal(fused[0].metadata.chunkId, "shared");
});
test("evaluation computes Recall@K, MRR and nDCG@10", () => {
  const metrics = evaluateRetrieval(
    [{ id: "q", relevantChunkIds: ["b"], relevanceGrades: { b: 3, a: 1 } }],
    [{ queryId: "q", rankedChunkIds: ["a", "b"] }],
    2,
  );
  assert.equal(metrics.recallAtK, 1);
  assert.equal(metrics.mrr, 0.5);
  assert.ok(metrics.ndcgAt10 > 0 && metrics.ndcgAt10 < 1);
});
test("citations use stable IDs, scores, and distinguish coverage samples", () => {
  const retrieved = formatRetrievedContext([c("stable", 0.6)]);
  assert.equal(retrieved.citations?.[0].id, "stable");
  assert.equal(retrieved.citations?.[0].relevance, "medium");
  const coverage = formatRetrievedContext([c("stable", 0)], "coverage");
  assert.match(coverage.context, /not query-retrieved evidence/);
  assert.equal(coverage.citations?.[0].relevance, "coverage-sample");
});
test("passage gate blocks prompt injection and keeps contradiction evidence", () => {
  assert.equal(
    shouldKeepPassage({
      relevant: 0.9,
      usableEvidence: 0.9,
      contradiction: 0,
      promptInjection: 0.9,
    }),
    false,
  );
  assert.equal(
    shouldKeepPassage({
      relevant: 0.2,
      usableEvidence: 0.2,
      contradiction: 0.8,
      promptInjection: 0.1,
    }),
    true,
  );
});
