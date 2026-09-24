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

import { isJevStatsAllowedEmail } from "@/lib/jev/stats";

test("isJevStatsAllowedEmail allows only the configured email", () => {
  assert.equal(
    isJevStatsAllowedEmail("shubhobera98@gmail.com", "shubhobera98@gmail.com"),
    true,
  );
  assert.equal(
    isJevStatsAllowedEmail("someoneelse@gmail.com", "shubhobera98@gmail.com"),
    false,
  );
});

test("isJevStatsAllowedEmail matches case-insensitively and trims", () => {
  assert.equal(
    isJevStatsAllowedEmail("ShubhoBera98@Gmail.com", "shubhobera98@gmail.com"),
    true,
  );
  assert.equal(
    isJevStatsAllowedEmail(
      " shubhobera98@gmail.com ",
      " shubhobera98@gmail.com ",
    ),
    true,
  );
});

test("isJevStatsAllowedEmail fails closed when env is unset or blank", () => {
  assert.equal(isJevStatsAllowedEmail("shubhobera98@gmail.com", undefined), false);
  assert.equal(isJevStatsAllowedEmail("shubhobera98@gmail.com", ""), false);
  assert.equal(isJevStatsAllowedEmail("shubhobera98@gmail.com", "   "), false);
  assert.equal(isJevStatsAllowedEmail(null, "shubhobera98@gmail.com"), false);
  assert.equal(isJevStatsAllowedEmail(undefined, "shubhobera98@gmail.com"), false);
});

import {
  createJevStatsCache,
  JEV_STATS_CACHE_DEFAULT_TTL_SECONDS,
  JEV_STATS_CACHE_MAX_TTL_SECONDS,
  resolveJevStatsCacheTtlMs,
  type JevStatsPayload,
  type JevStatsQuery,
} from "@/lib/jev/stats";

function statsQuery(overrides: Partial<JevStatsQuery> = {}): JevStatsQuery {
  return { days: 30, checkpoint: null, mode: null, ...overrides };
}

function statsPayload(query: JevStatsQuery, marker: number): JevStatsPayload {
  return {
    window: { ...query, since: new Date(marker).toISOString() },
    checkpoints: [],
  };
}

function statsCacheHarness(ttlMs: number) {
  let clock = 1_000_000;
  let calls = 0;
  const load = createJevStatsCache({
    compute: async (query) => {
      calls += 1;
      return statsPayload(query, calls);
    },
    ttlMs: () => ttlMs,
    now: () => clock,
  });
  return {
    load,
    calls: () => calls,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

test("resolveJevStatsCacheTtlMs defaults, clamps and accepts zero", () => {
  const defaultMs = JEV_STATS_CACHE_DEFAULT_TTL_SECONDS * 1000;
  assert.equal(resolveJevStatsCacheTtlMs(undefined), defaultMs);
  assert.equal(resolveJevStatsCacheTtlMs(""), defaultMs);
  assert.equal(resolveJevStatsCacheTtlMs("  "), defaultMs);
  assert.equal(resolveJevStatsCacheTtlMs("abc"), defaultMs);
  assert.equal(resolveJevStatsCacheTtlMs("-5"), defaultMs);
  assert.equal(resolveJevStatsCacheTtlMs("2.5"), defaultMs);
  assert.equal(resolveJevStatsCacheTtlMs("0"), 0);
  assert.equal(resolveJevStatsCacheTtlMs(" 45 "), 45_000);
  assert.equal(
    resolveJevStatsCacheTtlMs("100000"),
    JEV_STATS_CACHE_MAX_TTL_SECONDS * 1000,
  );
});

test("stats cache serves repeat requests within the TTL from memory", async () => {
  const harness = statsCacheHarness(30_000);
  const first = await harness.load(statsQuery());
  harness.advance(29_999);
  const second = await harness.load(statsQuery());
  assert.equal(harness.calls(), 1);
  assert.deepEqual(second, first);
});

test("stats cache recomputes once the TTL has elapsed", async () => {
  const harness = statsCacheHarness(30_000);
  await harness.load(statsQuery());
  harness.advance(30_000);
  await harness.load(statsQuery());
  assert.equal(harness.calls(), 2);
});

test("stats cache keys by days, checkpoint and mode", async () => {
  const harness = statsCacheHarness(30_000);
  await harness.load(statsQuery());
  await harness.load(statsQuery({ days: 7 }));
  await harness.load(statsQuery({ checkpoint: "planner" }));
  await harness.load(statsQuery({ mode: "shadow" }));
  await harness.load(statsQuery({ days: 7 }));
  assert.equal(harness.calls(), 4);
});

test("stats cache coalesces concurrent requests into one computation", async () => {
  const harness = statsCacheHarness(30_000);
  const results = await Promise.all(
    Array.from({ length: 50 }, () => harness.load(statsQuery())),
  );
  assert.equal(harness.calls(), 1);
  assert.ok(results.every((result) => result === results[0]));
});

test("stats cache TTL of zero always reads fresh", async () => {
  const harness = statsCacheHarness(0);
  await harness.load(statsQuery());
  await harness.load(statsQuery());
  assert.equal(harness.calls(), 2);
});

test("stats cache never keeps a failed computation", async () => {
  let calls = 0;
  const load = createJevStatsCache({
    compute: async (query) => {
      calls += 1;
      if (calls === 1) throw new Error("db down");
      return statsPayload(query, calls);
    },
    ttlMs: () => 30_000,
    now: () => 0,
  });
  await assert.rejects(load(statsQuery()), /db down/);
  const recovered = await load(statsQuery());
  assert.equal(calls, 2);
  assert.equal(recovered.window.since, new Date(2).toISOString());
});
