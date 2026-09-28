import test from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { queryJevStats } from "@/lib/jev/stats";
import { logJevDecision } from "@/lib/jev/telemetry";

const database = process.env.JEV_TEST_DATABASE_URL;

test("historical breaker rows are reclassified by PostgreSQL", { skip: !database }, async () => {
  assert.equal(process.env.DATABASE_URL, database);
  const marker = `jev-historical-${Date.now()}`;
  const base = {
    checkpoint: "tool_router", schemaVersion: "1", modelVersion: "unknown",
    mode: "shadow", outcome: "error", fallbackUsed: true, latencyMs: 0,
    conversationId: marker,
  };
  try {
    await prisma.jevDecision.createMany({ data: [
      { ...base, fallbackReason: "circuit_open" },
      { ...base, fallbackReason: "error" },
    ] });
    const [stats] = await queryJevStats({ days: 1, checkpoint: "tool_router", mode: "shadow" });
    assert.equal(stats.total, 2);
    assert.deepEqual(stats.outcomes, { circuit_open: 1, error: 1 });
    assert.deepEqual(stats.modes[0].outcomes, { circuit_open: 1, error: 1 });
  } finally {
    await prisma.jevDecision.deleteMany({ where: { conversationId: marker } });
  }
});

test("blocked decision persists with a distinct outcome in PostgreSQL", { skip: !database }, async () => {
  assert.equal(process.env.DATABASE_URL, database);
  const writableEnv = process.env as Record<string, string | undefined>;
  const oldNodeEnv = writableEnv.NODE_ENV;
  writableEnv.NODE_ENV = "development";
  const requestId = `jev-durable-${Date.now()}`;
  try {
    logJevDecision({
      checkpoint: "tool_router", schemaVersion: "1", modelVersion: "unknown",
      mode: "shadow", latencyMs: 0, outcome: "error", fallbackUsed: true,
      fallbackReason: "circuit_open", requestId,
    });
    let row = await prisma.jevDecision.findFirst({ where: { requestId } });
    for (let i = 0; i < 20 && !row; i++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      row = await prisma.jevDecision.findFirst({ where: { requestId } });
    }
    assert.equal(row?.outcome, "circuit_open");
    assert.equal(row.fallbackReason, "circuit_open");
  } finally {
    await prisma.jevDecision.deleteMany({ where: { requestId } });
    if (oldNodeEnv === undefined) delete writableEnv.NODE_ENV;
    else writableEnv.NODE_ENV = oldNodeEnv;
  }
});
