import test from "node:test";
import assert from "node:assert/strict";

import {
  cacheGateDefersToOrchestrator,
  gateCacheHit,
  mapJevCacheGateResult,
  shouldServeCachedAnswer,
  JEV_CACHE_GATE_SCHEMA_VERSION,
  type JevCacheGateState,
} from "@/lib/jev/cacheGate";
import {
  JEV_HITL_ESCALATE_THRESHOLD,
  JEV_HITL_IRREVERSIBLE_THRESHOLD,
  mapJevHitlEscalationResult,
  shouldJevEscalate,
} from "@/lib/jev/hitlEscalation";
import {
  jevHitlSignature,
  resolveJevHitlVerdict,
} from "@/lib/orchestrator/jevHitl";
import { getJevMode, isJevEnabled } from "@/lib/jev/config";
import { JevCheckpoint } from "@/lib/jev/types";
import type {
  JevDecisionClient,
  JevEvaluateResult,
} from "@/lib/jev/client";
import type { JevEvaluateInput } from "@/lib/jev/types";
import { withEnv } from "@/tests/helpers";

function fakeResult(answers: Record<string, unknown>): JevEvaluateResult {
  return {
    answers: answers as JevEvaluateResult["answers"],
    modelVersion: "jev-test",
    latencyMs: 5,
  };
}

function fakeClient(
  answers: Record<string, unknown> | (() => Error),
  capture?: JevEvaluateInput[],
): JevDecisionClient {
  return {
    evaluate(input: JevEvaluateInput): Promise<JevEvaluateResult> {
      capture?.push(input);
      if (typeof answers === "function") return Promise.reject(answers());
      return Promise.resolve(fakeResult(answers));
    },
  } as unknown as JevDecisionClient;
}

const CACHE_STATE: JevCacheGateState = {
  similarityScore: 0.9,
  similarityThreshold: 0.85,
  scoreMargin: 0.05,
  cacheAgeSeconds: 120,
  cacheTtlSeconds: 86_400,
  entryScopedToConversation: false,
  queryLengthChars: 42,
  answerLengthChars: 512,
};

const SERVE = {
  serve_from_cache: { type: "noul", noul: 0.95 },
  staleness_risk: { type: "noul", noul: 0.05 },
};
const VETO = {
  serve_from_cache: { type: "noul", noul: 0.1 },
  staleness_risk: { type: "noul", noul: 0.9 },
};

// ---------- config ----------

test("Phase 5 checkpoints default to off and read valid modes", () => {
  withEnv(
    { JEV_CACHE_GATE_MODE: undefined, JEV_HITL_ESCALATION_MODE: undefined },
    () => {
      assert.equal(getJevMode(JevCheckpoint.CACHE_GATE), "off");
      assert.equal(getJevMode(JevCheckpoint.HITL_ESCALATION), "off");
      assert.equal(isJevEnabled(JevCheckpoint.CACHE_GATE), false);
      assert.equal(isJevEnabled(JevCheckpoint.HITL_ESCALATION), false);
    },
  );
  withEnv(
    { JEV_CACHE_GATE_MODE: "active", JEV_HITL_ESCALATION_MODE: "shadow" },
    () => {
      assert.equal(getJevMode(JevCheckpoint.CACHE_GATE), "active");
      assert.equal(getJevMode(JevCheckpoint.HITL_ESCALATION), "shadow");
    },
  );
  withEnv({ JEV_CACHE_GATE_MODE: "BANANA" }, () => {
    assert.equal(getJevMode(JevCheckpoint.CACHE_GATE), "off");
  });
});

test("cache gate defers the pre-check to the orchestrator only in active mode", () => {
  withEnv({ JEV_CACHE_GATE_MODE: "active" }, () => {
    assert.equal(cacheGateDefersToOrchestrator(), true);
  });
  for (const mode of [undefined, "off", "shadow", "ab"]) {
    withEnv({ JEV_CACHE_GATE_MODE: mode }, () => {
      assert.equal(cacheGateDefersToOrchestrator(), false);
    });
  }
});

// ---------- cache gate mapping ----------

test("mapJevCacheGateResult maps a valid response", () => {
  const decision = mapJevCacheGateResult(fakeResult(SERVE));
  assert.ok(decision);
  assert.equal(decision.serveFromCache, 0.95);
  assert.equal(decision.stalenessRisk, 0.05);
});

test("mapJevCacheGateResult returns null on missing or mistyped answers", () => {
  assert.equal(mapJevCacheGateResult(fakeResult({})), null);
  assert.equal(
    mapJevCacheGateResult(fakeResult({ serve_from_cache: SERVE.serve_from_cache })),
    null,
  );
  assert.equal(
    mapJevCacheGateResult(
      fakeResult({
        serve_from_cache: { type: "choice", choice: "yes" },
        staleness_risk: SERVE.staleness_risk,
      }),
    ),
    null,
  );
});

test("shouldServeCachedAnswer requires both signals to agree", () => {
  assert.equal(
    shouldServeCachedAnswer({ serveFromCache: 0.95, stalenessRisk: 0.05 }),
    true,
  );
  // One nervous signal alone never drops a hit.
  assert.equal(
    shouldServeCachedAnswer({ serveFromCache: 0.4, stalenessRisk: 0.05 }),
    false,
  );
  assert.equal(
    shouldServeCachedAnswer({ serveFromCache: 0.95, stalenessRisk: 0.9 }),
    false,
  );
  assert.equal(
    shouldServeCachedAnswer({ serveFromCache: 0.1, stalenessRisk: 0.9 }),
    false,
  );
});

// ---------- cache gate behavior ----------

test("cache gate off mode serves without a client", async () => {
  await withEnv({ JEV_CACHE_GATE_MODE: undefined }, async () => {
    const outcome = await gateCacheHit(CACHE_STATE, undefined, undefined);
    assert.equal(outcome.serve, true);
  });
});

test("cache gate shadow serves even when Jev would veto", async () => {
  const capture: JevEvaluateInput[] = [];
  await withEnv({ JEV_CACHE_GATE_MODE: "shadow" }, async () => {
    const outcome = await gateCacheHit(
      CACHE_STATE,
      "conv-1",
      fakeClient(VETO, capture),
    );
    assert.equal(outcome.serve, true);
  });
  assert.equal(capture.length, 1);
  assert.equal(capture[0].checkpoint, JevCheckpoint.CACHE_GATE);
  assert.equal(capture[0].schemaVersion, JEV_CACHE_GATE_SCHEMA_VERSION);
  // Structural state only: no query or answer text leaves for the API.
  const state = capture[0].state as Record<string, unknown>;
  assert.ok(!("query" in state) && !("answer" in state));
  assert.equal(typeof state.similarityScore, "number");
  assert.equal(typeof state.cacheAgeSeconds, "number");
});

test("cache gate ab observes without vetoing", async () => {
  await withEnv({ JEV_CACHE_GATE_MODE: "ab" }, async () => {
    const outcome = await gateCacheHit(CACHE_STATE, undefined, fakeClient(VETO));
    assert.equal(outcome.serve, true);
  });
});

test("cache gate active vetoes a confident no-serve verdict", async () => {
  await withEnv({ JEV_CACHE_GATE_MODE: "active" }, async () => {
    const outcome = await gateCacheHit(CACHE_STATE, undefined, fakeClient(VETO));
    assert.equal(outcome.serve, false);
  });
});

test("cache gate active serves a confident serve verdict", async () => {
  await withEnv({ JEV_CACHE_GATE_MODE: "active" }, async () => {
    const outcome = await gateCacheHit(CACHE_STATE, undefined, fakeClient(SERVE));
    assert.equal(outcome.serve, true);
  });
});

test("cache gate active refuses hits the gate could not evaluate", async () => {
  await withEnv({ JEV_CACHE_GATE_MODE: "active" }, async () => {
    const invalid = await gateCacheHit(
      CACHE_STATE,
      undefined,
      fakeClient({ unrelated: { type: "noul", noul: 0.1 } }),
    );
    assert.equal(invalid.serve, false);

    const down = await gateCacheHit(
      CACHE_STATE,
      undefined,
      fakeClient(() => new Error("provider down")),
    );
    assert.equal(down.serve, false);

    const timedOut = await gateCacheHit(
      CACHE_STATE,
      undefined,
      fakeClient(() => Object.assign(new Error("timeout"), { name: "AbortError" })),
    );
    assert.equal(timedOut.serve, false);
  });
});

test("cache gate active vetoes when the provider is not configured at all", async () => {
  await withEnv(
    { JEV_CACHE_GATE_MODE: "active", TYPESAFE_API_KEY: undefined },
    async () => {
      const outcome = await gateCacheHit(CACHE_STATE, undefined, undefined);
      assert.equal(outcome.serve, false);
    },
  );
});

test("cache gate shadow and ab serve when the provider is not configured", async () => {
  for (const mode of ["shadow", "ab"]) {
    await withEnv(
      { JEV_CACHE_GATE_MODE: mode, TYPESAFE_API_KEY: undefined },
      async () => {
        const outcome = await gateCacheHit(CACHE_STATE, undefined, undefined);
        assert.equal(outcome.serve, true, mode);
      },
    );
  }
});

test("cache gate shadow and ab still serve on invalid response and provider error", async () => {
  for (const mode of ["shadow", "ab"]) {
    await withEnv({ JEV_CACHE_GATE_MODE: mode }, async () => {
      const invalid = await gateCacheHit(
        CACHE_STATE,
        undefined,
        fakeClient({ unrelated: { type: "noul", noul: 0.1 } }),
      );
      assert.equal(invalid.serve, true, mode);

      const down = await gateCacheHit(
        CACHE_STATE,
        undefined,
        fakeClient(() => new Error("provider down")),
      );
      assert.equal(down.serve, true, mode);
    });
  }
});

test("cross-question contamination is not served when the active gate errors", async () => {
  const marginalHit: JevCacheGateState = {
    ...CACHE_STATE,
    similarityScore: 0.86,
    scoreMargin: 0.01,
    entryScopedToConversation: false,
  };
  await withEnv({ JEV_CACHE_GATE_MODE: "active" }, async () => {
    const errored = await gateCacheHit(
      marginalHit,
      "conv-marginal",
      fakeClient(() => new Error("provider down")),
    );
    assert.equal(errored.serve, false);

    const invalid = await gateCacheHit(
      marginalHit,
      "conv-marginal",
      fakeClient({}),
    );
    assert.equal(invalid.serve, false);

    const circuitOpen = await gateCacheHit(
      marginalHit,
      "conv-marginal",
      fakeClient(() => Object.assign(new Error("circuit open"), { name: "JevCircuitOpenError" })),
    );
    assert.equal(circuitOpen.serve, false);
  });
});

test("cache gate active still serves a confidently evaluated marginal hit", async () => {
  const marginalHit: JevCacheGateState = {
    ...CACHE_STATE,
    similarityScore: 0.86,
    scoreMargin: 0.01,
  };
  await withEnv({ JEV_CACHE_GATE_MODE: "active" }, async () => {
    const outcome = await gateCacheHit(marginalHit, undefined, fakeClient(SERVE));
    assert.equal(outcome.serve, true);
  });
});

// ---------- HITL escalation mapping ----------

test("mapJevHitlEscalationResult maps a valid response", () => {
  const decision = mapJevHitlEscalationResult(
    fakeResult({
      needs_human_review: { type: "noul", noul: 0.9 },
      irreversible_or_external: { type: "noul", noul: 0.8 },
    }),
  );
  assert.ok(decision);
  assert.equal(decision.needsHumanReview, 0.9);
  assert.equal(decision.irreversibleOrExternal, 0.8);
});

test("mapJevHitlEscalationResult returns null on missing or mistyped answers", () => {
  assert.equal(mapJevHitlEscalationResult(fakeResult({})), null);
  assert.equal(
    mapJevHitlEscalationResult(
      fakeResult({ needs_human_review: { type: "noul", noul: 0.9 } }),
    ),
    null,
  );
  assert.equal(
    mapJevHitlEscalationResult(
      fakeResult({
        needs_human_review: { type: "score", score: 3 },
        irreversible_or_external: { type: "noul", noul: 0.8 },
      }),
    ),
    null,
  );
});

test("shouldJevEscalate enforces the additive-only thresholds", () => {
  assert.equal(
    shouldJevEscalate({
      needsHumanReview: JEV_HITL_ESCALATE_THRESHOLD,
      irreversibleOrExternal: JEV_HITL_IRREVERSIBLE_THRESHOLD,
    }),
    true,
  );
  // Below the review bar: no interrupt, however irreversible the call looks.
  assert.equal(
    shouldJevEscalate({
      needsHumanReview: JEV_HITL_ESCALATE_THRESHOLD - 0.01,
      irreversibleOrExternal: 1,
    }),
    false,
  );
  // Confident review request without real downside: no interrupt.
  assert.equal(
    shouldJevEscalate({
      needsHumanReview: 1,
      irreversibleOrExternal: JEV_HITL_IRREVERSIBLE_THRESHOLD - 0.01,
    }),
    false,
  );
});

// ---------- HITL signature and verdict ----------

test("jevHitlSignature is stable and distinguishes tool-call sets", () => {
  const calls = [
    { name: "GMAIL_SEND_EMAIL", args: { to: "a@b.com", body: "hi" } },
  ];
  assert.equal(jevHitlSignature(calls), jevHitlSignature(calls.map((c) => ({ ...c }))));
  assert.notEqual(
    jevHitlSignature(calls),
    jevHitlSignature([{ name: "GMAIL_SEND_EMAIL", args: { to: "x@y.com", body: "hi" } }]),
  );
  assert.notEqual(
    jevHitlSignature(calls),
    jevHitlSignature([...calls, { name: "SLACK_POST", args: {} }]),
  );
  assert.match(jevHitlSignature(calls), /^[0-9a-f]{64}$/);
  // Unserializable args degrade instead of throwing.
  const circular: { name: string; args: unknown } = { name: "T", args: {} };
  (circular.args as { self?: unknown }).self = circular.args;
  assert.match(jevHitlSignature([circular]), /^[0-9a-f]{64}$/);
});

test("resolveJevHitlVerdict returns null when off or no tool calls", async () => {
  await withEnv({ JEV_HITL_ESCALATION_MODE: undefined }, async () => {
    assert.equal(
      await resolveJevHitlVerdict([{ name: "GMAIL_SEND_EMAIL", args: {} }], undefined),
      null,
    );
  });
  await withEnv({ JEV_HITL_ESCALATION_MODE: "active" }, async () => {
    assert.equal(await resolveJevHitlVerdict([], "conv-1"), null);
  });
});
