import test from "node:test";
import assert from "node:assert/strict";

import { prisma } from "@/lib/prisma";
import { searchSemanticCacheEntry, addToSemanticCache } from "@/lib/rag/storage/cache";

interface CapturedCall {
  query: string;
  params: unknown[];
}

async function withCapturedPrisma<T>(fn: (calls: CapturedCall[]) => Promise<T>): Promise<T> {
  const calls: CapturedCall[] = [];
  const client = prisma as unknown as Record<string, unknown>;
  const originalQueryRawUnsafe = client.$queryRawUnsafe;
  const originalExecuteRawUnsafe = client.$executeRawUnsafe;
  const originalExecuteRaw = client.$executeRaw;
  client.$queryRawUnsafe = async (query: string, ...params: unknown[]) => {
    calls.push({ query, params });
    return [];
  };
  client.$executeRawUnsafe = async (query: string, ...params: unknown[]) => {
    calls.push({ query, params });
    return 0;
  };
  client.$executeRaw = async () => 0;
  try {
    return await fn(calls);
  } finally {
    client.$queryRawUnsafe = originalQueryRawUnsafe;
    client.$executeRawUnsafe = originalExecuteRawUnsafe;
    client.$executeRaw = originalExecuteRaw;
  }
}

test("cache lookup is scoped by model and reasoning effort with null-safe effort matching", async () => {
  await withCapturedPrisma(async (calls) => {
    const result = await searchSemanticCacheEntry([0.1, 0.2], "user-1", "conv-1", "gpt-5.6-sol", "high");
    assert.equal(result, null);
    assert.equal(calls.length, 1);
    const { query, params } = calls[0];
    assert.match(query, /AND model = \$5/);
    assert.match(query, /AND reasoning_effort IS NOT DISTINCT FROM \$6/);
    assert.equal(params[4], "gpt-5.6-sol");
    assert.equal(params[5], "high");
  });
});

test("null effort binds SQL NULL so only no-effort entries match", async () => {
  await withCapturedPrisma(async (calls) => {
    await searchSemanticCacheEntry([0.1], "user-1", undefined, "gpt-5.5", null);
    assert.equal(calls[0].params[4], "gpt-5.5");
    assert.equal(calls[0].params[5], null);
  });
});

test("cache insert stores the producing model and effort", async () => {
  await withCapturedPrisma(async (calls) => {
    await addToSemanticCache("q", "a", [0.1], "user-1", "conv-1", "gpt-5.6-sol", "low");
    const insert = calls.find((c) => c.query.includes("INSERT INTO semantic_cache"));
    assert.ok(insert, "insert expected");
    assert.match(insert!.query, /model, reasoning_effort/);
    assert.equal(insert!.params[5], "gpt-5.6-sol");
    assert.equal(insert!.params[6], "low");
  });
});

test("a row created under a different effort can never match the lookup (predicate shape)", async () => {
  // The lookup requires model equality AND null-safe effort equality; a stored
  // row only matches when both columns equal the request's values. Verified by
  // simulating a stored row and applying the same predicate.
  await withCapturedPrisma(async (calls) => {
    await searchSemanticCacheEntry([0.1], "user-1", "conv-1", "gpt-5.6-sol", "high");
    const { params } = calls[0];
    const storedRow = { model: "gpt-5.6-sol", reasoning_effort: "low" };
    const matches =
      storedRow.model === params[4] &&
      (storedRow.reasoning_effort === params[5] ||
        (storedRow.reasoning_effort === null && params[5] === null));
    assert.equal(matches, false, "low-effort entry must not serve a high-effort request");
  });
});
