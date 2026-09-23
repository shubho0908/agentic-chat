import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

import { prisma } from "@/lib/prisma";
import { GET, POST } from "@/app/api/internal/orchestration/drain/route";

test("drain route answers the Vercel cron GET with the same handler as POST", () => {
  assert.equal(GET, POST);
});

test("drain route GET without the cron secret is rejected", async () => {
  const previous = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "cron-secret-for-test";
  try {
    const response = await GET(
      new NextRequest("http://localhost/api/internal/orchestration/drain", {
        method: "GET",
        headers: { authorization: "Bearer wrong-secret" },
      }),
    );
    assert.equal(response.status, 401);
  } finally {
    if (previous === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previous;
  }
});

async function withSecrets<T>(
  secrets: { drain?: string; cron?: string },
  fn: () => Promise<T>,
): Promise<T> {
  const previousDrain = process.env.ORCHESTRATION_DRAIN_SECRET;
  const previousCron = process.env.CRON_SECRET;
  if (secrets.drain === undefined) delete process.env.ORCHESTRATION_DRAIN_SECRET;
  else process.env.ORCHESTRATION_DRAIN_SECRET = secrets.drain;
  if (secrets.cron === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = secrets.cron;
  try {
    return await fn();
  } finally {
    if (previousDrain === undefined) delete process.env.ORCHESTRATION_DRAIN_SECRET;
    else process.env.ORCHESTRATION_DRAIN_SECRET = previousDrain;
    if (previousCron === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previousCron;
  }
}

async function withEmptyQueue<T>(fn: () => Promise<T>): Promise<T> {
  const client = prisma as unknown as Record<string, unknown>;
  const originalTransaction = client.$transaction;
  client.$transaction = async (callback: (tx: unknown) => Promise<unknown>) =>
    callback({
      $executeRaw: async () => 0,
      $queryRaw: async () => [],
    });
  try {
    return await fn();
  } finally {
    client.$transaction = originalTransaction;
  }
}

function cronRequest(secret: string) {
  return new NextRequest("http://localhost/api/internal/orchestration/drain", {
    method: "GET",
    headers: { authorization: `Bearer ${secret}` },
  });
}

test("drain route accepts the cron secret when a drain secret is also set", async () => {
  mock.timers.enable({ apis: ["Date"], now: new Date("2026-09-28T00:00:00Z") });
  try {
    await withSecrets({ drain: "drain-secret-for-test", cron: "cron-secret-for-test" }, () =>
      withEmptyQueue(async () => {
        const cron = await GET(cronRequest("cron-secret-for-test"));
        assert.equal(cron.status, 200);
        const drain = await POST(cronRequest("drain-secret-for-test"));
        assert.equal(drain.status, 200);
        const wrong = await GET(cronRequest("neither-secret"));
        assert.equal(wrong.status, 401);
      }),
    );
  } finally {
    mock.timers.reset();
  }
});

test("drain route reports the checkpoint prune result on a normal run", async () => {
  mock.timers.enable({ apis: ["Date"], now: new Date("2026-09-28T00:00:00Z") });
  try {
    await withSecrets({ cron: "cron-secret-for-test" }, () =>
      withEmptyQueue(async () => {
        const response = await POST(cronRequest("cron-secret-for-test"));
        assert.equal(response.status, 200);
        const body = await response.json();
        assert.equal(body.success, true);
        assert.equal(body.processed, 0);
        assert.equal(body.checkpointPrune.ran, false);
      }),
    );
  } finally {
    mock.timers.reset();
  }
});
