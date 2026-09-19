import test from "node:test";
import assert from "node:assert/strict";

import { rerankDocuments } from "@/lib/rag/retrieval/reranker";
import type { RerankDocument } from "@/types/rag";

function doc(content: string, score: number): RerankDocument {
  return {
    content,
    score,
    metadata: { attachmentId: "att-1", fileName: `${content}.txt` },
  };
}

function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const saved: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) {
    saved[key] = process.env[key];
    if (vars[key] === undefined) delete process.env[key];
    else process.env[key] = vars[key];
  }
  try {
    fn();
  } finally {
    for (const key of Object.keys(vars)) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
}

test("rerankDocuments returns empty for empty input regardless of mode", async () => {
  const result = await rerankDocuments("query", []);
  assert.deepEqual(result, []);
});

test("rerankDocuments passes through original order when nothing is configured", async () => {
  withEnv(
    {
      COHERE_API_KEY: undefined,
      JEV_RERANK_MODE: undefined,
      CLOUDFLARE_ACCOUNT_ID: undefined,
      CLOUDFLARE_API_TOKEN: undefined,
    },
    () => {},
  );
  const docs = [doc("a", 0.9), doc("b", 0.4), doc("c", 0.7)];
  const result = await rerankDocuments("query", docs, { topN: 2 });
  assert.equal(result.length, 3);
  assert.equal(result[0].content, "a");
  assert.equal(result[0].score, 0.9);
  assert.equal(result[0].originalScore, 0.9);
});
