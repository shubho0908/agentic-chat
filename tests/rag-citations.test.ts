import test from "node:test";
import assert from "node:assert/strict";

import { relevanceForScore } from "@/lib/rag/retrieval/context";

test("relevance bands map scores honestly", () => {
  assert.equal(relevanceForScore(0.95), "high");
  assert.equal(relevanceForScore(0.8), "high");
  assert.equal(relevanceForScore(0.79), "medium");
  assert.equal(relevanceForScore(0.5), "medium");
  assert.equal(relevanceForScore(0.49), "low");
  assert.equal(relevanceForScore(0), "low");
  assert.equal(relevanceForScore(undefined), "unknown");
});

test("relevance bands hold across the full score range", () => {
  for (let i = 0; i <= 100; i++) {
    const score = i / 100;
    const band = relevanceForScore(score);
    if (score >= 0.8) assert.equal(band, "high");
    else if (score >= 0.5) assert.equal(band, "medium");
    else assert.equal(band, "low");
  }
  assert.equal(relevanceForScore(NaN), "low");
});
