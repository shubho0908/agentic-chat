import test from "node:test";
import assert from "node:assert/strict";

import {
  JEV_STATS_DEFAULT_DAYS,
  JEV_STATS_MAX_DAYS,
  mergeJevStats,
  parseJevStatsQuery,
} from "@/lib/jev/stats";

function params(query: string): URLSearchParams {
  return new URLSearchParams(query);
}

test("parseJevStatsQuery defaults to the 30 day window, all checkpoints", () => {
  const result = parseJevStatsQuery(params(""));
  assert.deepEqual(result, {
    days: JEV_STATS_DEFAULT_DAYS,
    checkpoint: null,
    mode: null,
  });
});

test("parseJevStatsQuery accepts a valid checkpoint and day window", () => {
  const result = parseJevStatsQuery(params("checkpoint=planner&days=7"));
  assert.deepEqual(result, { days: 7, checkpoint: "planner", mode: null });
});

test("parseJevStatsQuery clamps the window into 1..90", () => {
  assert.deepEqual(parseJevStatsQuery(params("days=365")), {
    days: JEV_STATS_MAX_DAYS,
    checkpoint: null,
    mode: null,
  });
  assert.deepEqual(parseJevStatsQuery(params("days=1")), {
    days: 1,
    checkpoint: null,
    mode: null,
  });
});

test("parseJevStatsQuery rejects invalid days and unknown checkpoints", () => {
  assert.ok("error" in parseJevStatsQuery(params("days=abc")));
  assert.ok("error" in parseJevStatsQuery(params("days=-3")));
  const unknown = parseJevStatsQuery(params("checkpoint=banana"));
  assert.ok("error" in unknown);
  if ("error" in unknown) {
    assert.match(unknown.error, /planner/);
  }
});

test("parseJevStatsQuery accepts every registered checkpoint", () => {
  for (const name of [
    "cache_gate",
    "rerank",
    "passage_gate",
    "planner",
    "tool_router",
    "hitl_escalation",
    "memory_gate",
    "memory_evidence",
    "memory_storage",
  ]) {
    assert.deepEqual(parseJevStatsQuery(params(`checkpoint=${name}`)), {
      days: JEV_STATS_DEFAULT_DAYS,
      checkpoint: name,
      mode: null,
    });
  }
});

test("mergeJevStats combines outcome counts with latency aggregates", () => {
  const merged = mergeJevStats(
    [
      { checkpoint: "planner", outcome: "agree", count: 90 },
      { checkpoint: "planner", outcome: "disagree", count: 10 },
      { checkpoint: "rerank", outcome: "applied", count: 5 },
    ],
    [
      {
        checkpoint: "planner",
        total: 100,
        fallback_rate: 0.02,
        p50: 412.4,
        p95: 1801.9,
      },
      { checkpoint: "rerank", total: 5, fallback_rate: 0, p50: 300, p95: null },
    ],
  );
  assert.equal(merged.length, 2);
  const planner = merged.find((row) => row.checkpoint === "planner");
  assert.ok(planner);
  assert.equal(planner.total, 100);
  assert.deepEqual(planner.outcomes, { agree: 90, disagree: 10 });
  assert.equal(planner.fallbackRate, 0.02);
  assert.deepEqual(planner.latencyMs, { p50: 412, p95: 1802 });
  assert.deepEqual(planner.modes, []);
  assert.equal(merged[0].checkpoint, "planner");
  const rerank = merged.find((row) => row.checkpoint === "rerank");
  assert.ok(rerank);
  assert.deepEqual(rerank.latencyMs, { p50: 300, p95: null });
});

test("mergeJevStats keeps checkpoints that have outcome rows but no latency row", () => {
  const merged = mergeJevStats(
    [{ checkpoint: "cache_gate", outcome: "serve", count: 3 }],
    [],
  );
  assert.deepEqual(merged, [
    {
      checkpoint: "cache_gate",
      total: 0,
      outcomes: { serve: 3 },
      fallbackRate: 0,
      latencyMs: { p50: null, p95: null },
      modes: [],
    },
  ]);
});

test("parseJevStatsQuery validates and returns the mode filter", () => {
  assert.deepEqual(
    parseJevStatsQuery(params("checkpoint=cache_gate&mode=active")),
    {
      days: JEV_STATS_DEFAULT_DAYS,
      checkpoint: "cache_gate",
      mode: "active",
    },
  );
  const invalid = parseJevStatsQuery(params("mode=enabled"));
  assert.ok("error" in invalid);
  if ("error" in invalid) assert.match(invalid.error, /active/);
});

test("mergeJevStats preserves totals and adds per-mode aggregates", () => {
  const merged = mergeJevStats(
    [
      { checkpoint: "cache_gate", outcome: "would_veto", count: 3 },
      { checkpoint: "cache_gate", outcome: "veto", count: 2 },
    ],
    [
      {
        checkpoint: "cache_gate",
        total: 5,
        fallback_rate: 0.2,
        p50: 10,
        p95: 30,
      },
    ],
    [
      {
        checkpoint: "cache_gate",
        mode: "shadow",
        outcome: "would_veto",
        count: 3,
      },
      { checkpoint: "cache_gate", mode: "active", outcome: "veto", count: 2 },
    ],
    [
      {
        checkpoint: "cache_gate",
        mode: "shadow",
        total: 3,
        fallback_rate: 0,
        p50: 8,
        p95: 12,
      },
      {
        checkpoint: "cache_gate",
        mode: "active",
        total: 2,
        fallback_rate: 0.5,
        p50: 20,
        p95: 30,
      },
    ],
  );
  assert.deepEqual(merged[0], {
    checkpoint: "cache_gate",
    total: 5,
    outcomes: { would_veto: 3, veto: 2 },
    fallbackRate: 0.2,
    latencyMs: { p50: 10, p95: 30 },
    modes: [
      {
        mode: "shadow",
        total: 3,
        outcomes: { would_veto: 3 },
        fallbackRate: 0,
        latencyMs: { p50: 8, p95: 12 },
      },
      {
        mode: "active",
        total: 2,
        outcomes: { veto: 2 },
        fallbackRate: 0.5,
        latencyMs: { p50: 20, p95: 30 },
      },
    ],
  });
});
