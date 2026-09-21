import test from "node:test";
import assert from "node:assert/strict";

import { gatePassages } from "@/lib/jev/passageGate";
import type { JevDecisionClient } from "@/lib/jev/client";
import type { RetrievalCandidate } from "@/lib/rag/retrieval/hybrid";
import { withEnv } from "./helpers";

const failingClient = {
  evaluate: async () => {
    throw new Error("provider down");
  },
} as unknown as JevDecisionClient;

function candidate(content: string): RetrievalCandidate {
  return {
    content,
    score: 0.9,
    metadata: { attachmentId: "att-1", fileName: "doc.pdf" },
  };
}

test("tool-capable flow drops the batch when the gate evaluation fails", () =>
  withEnv({ JEV_PASSAGE_GATE_MODE: "active" }, async () => {
    const input = [candidate("alpha"), candidate("bravo")];
    const result = await gatePassages("q", input, undefined, {
      dependency: failingClient,
      failClosed: true,
    });
    assert.deepEqual(result, []);
  }));

test("read-only flow keeps the batch when the gate evaluation fails", () =>
  withEnv({ JEV_PASSAGE_GATE_MODE: "active" }, async () => {
    const input = [candidate("alpha"), candidate("bravo")];
    const result = await gatePassages("q", input, undefined, {
      dependency: failingClient,
    });
    assert.equal(result.length, 2);
  }));

test("off mode returns candidates without evaluating", () =>
  withEnv({ JEV_PASSAGE_GATE_MODE: undefined }, async () => {
    const input = [candidate("alpha")];
    const result = await gatePassages("q", input, undefined, {
      dependency: failingClient,
      failClosed: true,
    });
    assert.equal(result.length, 1);
  }));
