import test from "node:test";
import assert from "node:assert/strict";

import { getJevOnFailure } from "@/lib/jev/config";
import { JevCheckpoint, JevOnFailure } from "@/lib/jev/types";
import { gateCacheHit, type JevCacheGateState } from "@/lib/jev/cacheGate";
import { gatePassages } from "@/lib/jev/passageGate";
import { gateMemoryEvidence } from "@/lib/jev/memoryEvidenceGate";
import {
  mediateMemoryIntent,
  memoryGateDegradation,
  MemoryGateReason,
} from "@/lib/jev/memoryGate";
import type { RetrievalCandidate } from "@/lib/rag/retrieval/hybrid";
import type {
  JevDecisionClient,
  JevEvaluateResult,
} from "@/lib/jev/client";
import { withEnv } from "@/tests/helpers";

function fakeResult(
  answers: Record<string, unknown>,
  rawBody?: string,
): JevEvaluateResult {
  return {
    answers: answers as JevEvaluateResult["answers"],
    modelVersion: "jev-test",
    latencyMs: 5,
    ...(rawBody !== undefined && { rawBody }),
  };
}

function rejectingClient(error: Error): JevDecisionClient {
  return {
    evaluate(): Promise<JevEvaluateResult> {
      return Promise.reject(error);
    },
  } as unknown as JevDecisionClient;
}

function resolvingClient(result: JevEvaluateResult): JevDecisionClient {
  return {
    evaluate(): Promise<JevEvaluateResult> {
      return Promise.resolve(result);
    },
  } as unknown as JevDecisionClient;
}

function captureLogs(): {
  entries: Array<Record<string, unknown>>;
  restore: () => void;
} {
  const entries: Array<Record<string, unknown>> = [];
  const original = { info: console.info, warn: console.warn, error: console.error };
  const record = (args: unknown[]) => {
    if (typeof args[0] !== "string") return;
    try {
      entries.push(JSON.parse(args[0]) as Record<string, unknown>);
    } catch {
      // Non-JSON writes are irrelevant here.
    }
  };
  console.info = (...args: unknown[]) => record(args);
  console.warn = (...args: unknown[]) => record(args);
  console.error = (...args: unknown[]) => record(args);
  return {
    entries,
    restore: () => {
      console.info = original.info;
      console.warn = original.warn;
      console.error = original.error;
    },
  };
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

const candidate = (id: string): RetrievalCandidate => ({
  content: `content-${id}`,
  score: 1,
  metadata: { chunkId: id, attachmentId: "a", fileName: "a.pdf" },
});

// ---------- config ----------

test("getJevOnFailure defaults match shipped behavior", () => {
  withEnv(
    {
      JEV_CACHE_GATE_ON_FAILURE: undefined,
      JEV_PASSAGE_GATE_ON_FAILURE: undefined,
      JEV_MEMORY_GATE_ON_FAILURE: undefined,
      JEV_MEMORY_EVIDENCE_ON_FAILURE: undefined,
    },
    () => {
      assert.equal(
        getJevOnFailure(JevCheckpoint.CACHE_GATE),
        JevOnFailure.CLOSED,
      );
      assert.equal(
        getJevOnFailure(JevCheckpoint.PASSAGE_GATE),
        JevOnFailure.OPEN,
      );
      assert.equal(
        getJevOnFailure(JevCheckpoint.MEMORY_GATE),
        JevOnFailure.OPEN,
      );
      assert.equal(
        getJevOnFailure(JevCheckpoint.MEMORY_EVIDENCE),
        JevOnFailure.CLOSED,
      );
    },
  );
});

test("getJevOnFailure reads valid values and rejects garbage", () => {
  withEnv({ JEV_CACHE_GATE_ON_FAILURE: "OPEN" }, () => {
    assert.equal(getJevOnFailure(JevCheckpoint.CACHE_GATE), JevOnFailure.OPEN);
  });
  withEnv({ JEV_PASSAGE_GATE_ON_FAILURE: "closed" }, () => {
    assert.equal(
      getJevOnFailure(JevCheckpoint.PASSAGE_GATE),
      JevOnFailure.CLOSED,
    );
  });
  withEnv({ JEV_CACHE_GATE_ON_FAILURE: "BANANA" }, () => {
    assert.equal(
      getJevOnFailure(JevCheckpoint.CACHE_GATE),
      JevOnFailure.CLOSED,
    );
  });
});

// ---------- cache gate ----------

test("cache gate active vetoes on failure by default and serves when open", async () => {
  const error = new Error("provider down");
  const closed = await withEnv({ JEV_CACHE_GATE_MODE: "active" }, () =>
    gateCacheHit(CACHE_STATE, undefined, rejectingClient(error)),
  );
  assert.equal(closed.serve, false);

  const open = await withEnv(
    {
      JEV_CACHE_GATE_MODE: "active",
      JEV_CACHE_GATE_ON_FAILURE: "open",
    },
    () => gateCacheHit(CACHE_STATE, undefined, rejectingClient(error)),
  );
  assert.equal(open.serve, true);
});

test("cache gate active open serves and logs the body on an unusable response", async () => {
  const logs = captureLogs();
  try {
    const result = await withEnv(
      {
        JEV_CACHE_GATE_MODE: "active",
        JEV_CACHE_GATE_ON_FAILURE: "open",
      },
      () =>
        gateCacheHit(
          CACHE_STATE,
          undefined,
          resolvingClient(fakeResult({}, '{"answers":{"wrong":true}}')),
        ),
    );
    assert.equal(result.serve, true);
  } finally {
    logs.restore();
  }
  const fallback = logs.entries.find(
    (entry) => entry.event === "jev_cache_gate_fallback",
  );
  assert.ok(fallback, "the invalid response must hit the fallback event");
  assert.equal(fallback?.responseBody, '{"answers":{"wrong":true}}');
});

// ---------- passage gate ----------

test("passage gate active drops unchecked passages only when closed", async () => {
  const error = new Error("provider down");
  const candidates = [candidate("a"), candidate("b")];

  const open = await withEnv({ JEV_PASSAGE_GATE_MODE: "active" }, () =>
    gatePassages("q", candidates, undefined, rejectingClient(error)),
  );
  assert.deepEqual(open, candidates);

  const closed = await withEnv(
    {
      JEV_PASSAGE_GATE_MODE: "active",
      JEV_PASSAGE_GATE_ON_FAILURE: "closed",
    },
    () => gatePassages("q", candidates, undefined, rejectingClient(error)),
  );
  assert.deepEqual(closed, []);

  const shadow = await withEnv(
    {
      JEV_PASSAGE_GATE_MODE: "shadow",
      JEV_PASSAGE_GATE_ON_FAILURE: "closed",
    },
    () => gatePassages("q", candidates, undefined, rejectingClient(error)),
  );
  assert.deepEqual(
    shadow,
    candidates,
    "shadow never changes behavior, even under a closed posture",
  );
});

// ---------- memory evidence gate ----------

test("memory evidence gate keeps high-confidence records by default and all when open", async () => {
  const records = [
    { memory: "high confidence fact", score: 0.9 },
    { memory: "mid confidence fact", score: 0.5 },
  ];
  const error = new Error("provider down");

  const closed = await withEnv({ JEV_MEMORY_EVIDENCE_MODE: "active" }, () =>
    gateMemoryEvidence("q", records, undefined, undefined, rejectingClient(error)),
  );
  assert.deepEqual(
    closed.map((r) => r.memory),
    ["high confidence fact"],
  );

  const open = await withEnv(
    {
      JEV_MEMORY_EVIDENCE_MODE: "active",
      JEV_MEMORY_EVIDENCE_ON_FAILURE: "open",
    },
    () =>
      gateMemoryEvidence(
        "q",
        records,
        undefined,
        undefined,
        rejectingClient(error),
      ),
  );
  assert.deepEqual(
    open.map((r) => r.memory),
    ["high confidence fact", "mid confidence fact"],
  );
});

// ---------- memory gate ----------

test("memory gate active closed skips unvettable retrieval, open keeps the legacy heuristic", async () => {
  const env = {
    JEV_MEMORY_GATE_MODE: "active",
    TYPESAFE_API_KEY: undefined,
    MEMORY_ENABLED: undefined,
  };
  const args = { messageText: "give me a pasta recipe", userId: "u1" };

  const closed = await withEnv(
    { ...env, JEV_MEMORY_GATE_ON_FAILURE: "closed" },
    () => mediateMemoryIntent(args),
  );
  assert.equal(closed.shouldQuery, false);
  assert.equal(closed.reasonCode, MemoryGateReason.PROVIDER_FAILURE);
  assert.ok(
    memoryGateDegradation(closed),
    "a closed skip must surface as a memory degradation",
  );

  const open = await withEnv(
    { ...env, JEV_MEMORY_GATE_ON_FAILURE: "open" },
    () => mediateMemoryIntent(args),
  );
  assert.equal(open.reasonCode, MemoryGateReason.LEGACY_HEURISTIC);
  assert.equal(memoryGateDegradation(open), null);
});
