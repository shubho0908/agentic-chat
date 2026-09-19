import test from "node:test";
import assert from "node:assert/strict";

import { getJevMode, isJevEnabled } from "@/lib/jev/config";
import { JevCheckpoint } from "@/lib/jev/types";
import {
  JevConfigurationError,
  JevDecisionClient,
} from "@/lib/jev/client";
import { mapJevPlannerResult } from "@/lib/jev/planner";
import { mapJevRerankScore } from "@/lib/jev/reranker";
import type { JevEvaluateResult } from "@/lib/jev/client";
import { withEnv } from "@/tests/helpers";

function fakeResult(answers: Record<string, unknown>): JevEvaluateResult {
  return {
    answers: answers as JevEvaluateResult["answers"],
    modelVersion: "jev-1.13.0",
    latencyMs: 42,
  };
}

test("getJevMode defaults to off when unset", () => {
  withEnv({ JEV_PLANNER_MODE: undefined }, () => {
    assert.equal(getJevMode(JevCheckpoint.PLANNER), "off");
    assert.equal(isJevEnabled(JevCheckpoint.PLANNER), false);
  });
});

test("getJevMode reads valid modes and rejects garbage", () => {
  withEnv({ JEV_PLANNER_MODE: "shadow" }, () => {
    assert.equal(getJevMode(JevCheckpoint.PLANNER), "shadow");
    assert.equal(isJevEnabled(JevCheckpoint.PLANNER), true);
  });
  withEnv({ JEV_PLANNER_MODE: "BANANA" }, () => {
    assert.equal(getJevMode(JevCheckpoint.PLANNER), "off");
  });
  withEnv({ JEV_RERANK_MODE: "ab" }, () => {
    assert.equal(getJevMode(JevCheckpoint.RERANK), "ab");
  });
});

test("JevDecisionClient throws without credentials", () => {
  withEnv(
    { TYPESAFE_API_KEY: undefined },
    () => {
      assert.throws(() => new JevDecisionClient(), JevConfigurationError);
    },
  );
});

test("JevDecisionClient.createIfConfigured returns null without credentials", () => {
  withEnv(
    { TYPESAFE_API_KEY: undefined },
    () => {
      assert.equal(JevDecisionClient.createIfConfigured(), null);
    },
  );
});

test("JevDecisionClient accepts explicit credentials", () => {
  const client = new JevDecisionClient({ apiKey: "tok" });
  assert.ok(client instanceof JevDecisionClient);
});

test("mapJevPlannerResult maps a valid response", () => {
  const decision = mapJevPlannerResult(
    fakeResult({
      complexity: {
        type: "choice",
        choice: "tool_needed",
        confidence: 0.9,
        probabilities: { direct: 0.05, tool_needed: 0.9, multi_step: 0.05 },
      },
      needs_external_data: { type: "noul", noul: 0.8 },
      needs_clarification: { type: "noul", noul: 0.1 },
    }),
  );
  assert.ok(decision);
  assert.equal(decision.complexity, "tool_needed");
  assert.equal(decision.complexityConfidence, 0.9);
  assert.equal(decision.needsExternalData, 0.8);
  assert.equal(decision.needsClarification, 0.1);
});

test("mapJevPlannerResult rejects an out-of-set complexity choice", () => {
  const decision = mapJevPlannerResult(
    fakeResult({
      complexity: { type: "choice", choice: "explode" },
      needs_external_data: { type: "noul", noul: 0.5 },
      needs_clarification: { type: "noul", noul: 0.5 },
    }),
  );
  assert.equal(decision, null);
});

test("mapJevPlannerResult rejects missing or wrong-typed answers", () => {
  assert.equal(
    mapJevPlannerResult(
      fakeResult({ complexity: { type: "choice", choice: "direct" } }),
    ),
    null,
  );
  assert.equal(
    mapJevPlannerResult(
      fakeResult({
        complexity: { type: "noul", noul: 0.5 },
        needs_external_data: { type: "noul", noul: 0.5 },
        needs_clarification: { type: "noul", noul: 0.5 },
      }),
    ),
    null,
  );
});

test("mapJevPlannerResult tolerates missing confidence", () => {
  const decision = mapJevPlannerResult(
    fakeResult({
      complexity: { type: "choice", choice: "direct" },
      needs_external_data: { type: "noul", noul: 0 },
      needs_clarification: { type: "noul", noul: 0 },
    }),
  );
  assert.ok(decision);
  assert.equal(decision.complexity, "direct");
  assert.equal(decision.complexityConfidence, undefined);
});

test("mapJevRerankScore extracts noul probability", () => {
  assert.equal(
    mapJevRerankScore(
      fakeResult({ answers_query: { type: "noul", noul: 0.73 } }),
    ),
    0.73,
  );
});

test("mapJevRerankScore returns null for wrong shape", () => {
  assert.equal(
    mapJevRerankScore(
      fakeResult({ answers_query: { type: "choice", choice: "yes" } }),
    ),
    null,
  );
  assert.equal(mapJevRerankScore(fakeResult({})), null);
});
