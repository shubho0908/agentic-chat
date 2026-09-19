import test from "node:test";
import assert from "node:assert/strict";

import { rerankDocuments } from "@/lib/rag/retrieval/reranker";
import { withEnv } from "@/tests/helpers";
import type { RerankDocument } from "@/types/rag";

function doc(content: string, score: number): RerankDocument {
  return {
    content,
    score,
    metadata: { attachmentId: "att-1", fileName: `${content}.txt` },
  };
}

test("rerankDocuments returns empty for empty input regardless of mode", async () => {
  const result = await rerankDocuments("query", []);
  assert.deepEqual(result, []);
});

test("rerankDocuments passes through original order when nothing is configured", async () => {
  const docs = [doc("a", 0.9), doc("b", 0.4), doc("c", 0.7)];
  const result = await withEnv(
    {
      COHERE_API_KEY: undefined,
      JEV_RERANK_MODE: undefined,
      TYPESAFE_API_KEY: undefined,
    },
    () => rerankDocuments("query", docs, { topN: 2 }),
  );
  assert.equal(result.length, 3);
  assert.equal(result[0].content, "a");
  assert.equal(result[0].score, 0.9);
});
