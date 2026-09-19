import test from "node:test";
import assert from "node:assert/strict";

import { rerankWithJev } from "@/lib/jev/reranker";
import type { JevDecisionClient, JevEvaluateResult } from "@/lib/jev/client";
import type { JevEvaluateInput } from "@/lib/jev/types";
import type { RerankDocument } from "@/types/rag";

function doc(content: string): RerankDocument {
  return {
    content,
    score: 0.5,
    metadata: { attachmentId: "att-1", fileName: `${content}.txt` },
  };
}

function noulResult(score: number): JevEvaluateResult {
  return {
    answers: { answers_query: { type: "noul", noul: score } },
    modelVersion: "jev-test",
    latencyMs: 1,
  };
}

test("a failed candidate aborts siblings in flight and stops new work", async () => {
  const calls: string[] = [];
  const aborted: string[] = [];

  const fakeClient = {
    evaluate(input: JevEvaluateInput): Promise<JevEvaluateResult> {
      const content = (input.state as { candidate: { content: string } })
        .candidate.content;
      calls.push(content);
      if (content === "bad") {
        return new Promise((_, reject) =>
          setTimeout(() => reject(new Error("provider boom")), 5),
        );
      }
      return new Promise((resolve, reject) => {
        input.signal?.addEventListener(
          "abort",
          () => {
            aborted.push(content);
            reject(new Error("cancelled"));
          },
          { once: true },
        );
        setTimeout(() => resolve(noulResult(0.9)), 500);
      });
    },
  } as unknown as JevDecisionClient;

  const docs = ["bad", "hang-1", "hang-2", "hang-3", "never-1", "never-2"].map(
    doc,
  );

  await assert.rejects(
    rerankWithJev(fakeClient, "query", docs, { requestId: "t" }),
    /provider boom/,
  );

  assert.equal(calls.length, 4, "no new candidates start after the failure");
  assert.equal(
    aborted.sort().join(","),
    "hang-1,hang-2,hang-3",
    "every in-flight sibling gets the cancellation signal",
  );
});

test("an already-aborted fan-out never calls the provider", async () => {
  const calls: string[] = [];
  const fakeClient = {
    evaluate(input: JevEvaluateInput): Promise<JevEvaluateResult> {
      const content = (input.state as { candidate: { content: string } })
        .candidate.content;
      calls.push(content);
      if (input.signal?.aborted) {
        return Promise.reject(new Error("cancelled"));
      }
      return Promise.resolve(noulResult(0.9));
    },
  } as unknown as JevDecisionClient;

  const docs = [doc("a"), doc("b")];
  const { results, modelVersion } = await rerankWithJev(
    fakeClient,
    "query",
    docs,
    { requestId: "t" },
  );
  assert.equal(results.length, 2);
  assert.equal(modelVersion, "jev-test");
  assert.equal(calls.length, 2);
});
