import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { GET, maxDuration } from "@/app/api/jev/stats/route";
import {
  JEV_STATS_ALLOWED_EMAIL_ENV,
  JEV_STATS_CACHE_TTL_ENV,
  JEV_STATS_QUERY_DEADLINE_MS,
  JEV_STATS_ROUTE_MAX_DURATION_SECONDS,
  JEV_STATS_STATEMENT_BUDGET_MS,
  JEV_STATS_TRANSACTION_MAX_WAIT_MS,
  JEV_STATS_TRANSACTION_TIMEOUT_MS,
} from "@/lib/jev/stats";

const OWNER_EMAIL = "owner@example.com";

type SessionResult = Awaited<ReturnType<typeof auth.api.getSession>>;

function sessionFor(email: string): SessionResult {
  return { user: { email } } as unknown as SessionResult;
}

async function callStatsRoute(options: {
  session: SessionResult;
  allowedEmail: string | undefined;
  query?: string;
}) {
  const previousAllowed = process.env[JEV_STATS_ALLOWED_EMAIL_ENV];
  const previousTtl = process.env[JEV_STATS_CACHE_TTL_ENV];
  if (options.allowedEmail === undefined) {
    delete process.env[JEV_STATS_ALLOWED_EMAIL_ENV];
  } else {
    process.env[JEV_STATS_ALLOWED_EMAIL_ENV] = options.allowedEmail;
  }
  process.env[JEV_STATS_CACHE_TTL_ENV] = "0";

  const getSession = mock.method(auth.api, "getSession", async () => options.session);
  const client = prisma as unknown as Record<string, unknown>;
  const originalTransaction = client.$transaction;
  let databaseQueries = 0;
  let transactions = 0;
  const statementTimeouts: unknown[] = [];
  const transactionOptions: unknown[] = [];
  const tx = {
    $executeRawUnsafe: async (_sql: string, ...values: unknown[]) => {
      statementTimeouts.push(values[0]);
      return 1;
    },
    $queryRawUnsafe: async () => {
      databaseQueries += 1;
      return [];
    },
  };
  client.$transaction = async (
    run: (client: typeof tx) => Promise<unknown>,
    options: unknown,
  ) => {
    transactions += 1;
    transactionOptions.push(options);
    return run(tx);
  };

  try {
    const response = await GET(
      new NextRequest(`http://localhost/api/jev/stats${options.query ?? ""}`),
    );
    return {
      status: response.status,
      body: (await response.json()) as Record<string, unknown>,
      databaseQueries,
      transactions,
      statementTimeouts,
      transactionOptions,
    };
  } finally {
    client.$transaction = originalTransaction;
    getSession.mock.restore();
    if (previousAllowed === undefined) delete process.env[JEV_STATS_ALLOWED_EMAIL_ENV];
    else process.env[JEV_STATS_ALLOWED_EMAIL_ENV] = previousAllowed;
    if (previousTtl === undefined) delete process.env[JEV_STATS_CACHE_TTL_ENV];
    else process.env[JEV_STATS_CACHE_TTL_ENV] = previousTtl;
  }
}

test("stats route rejects a request without a session before any stats query", async () => {
  const result = await callStatsRoute({ session: null, allowedEmail: OWNER_EMAIL });
  assert.equal(result.status, 401);
  assert.equal(result.databaseQueries, 0);
  assert.equal(result.transactions, 0);
});

test("stats route rejects a signed-in non-owner before any stats query", async () => {
  const result = await callStatsRoute({
    session: sessionFor("someone@example.com"),
    allowedEmail: OWNER_EMAIL,
  });
  assert.equal(result.status, 403);
  assert.equal(result.databaseQueries, 0);
  assert.equal(result.transactions, 0);
});

test("stats route denies everyone when the owner email is unset or blank", async () => {
  for (const allowedEmail of [undefined, "", "   "]) {
    const result = await callStatsRoute({
      session: sessionFor(OWNER_EMAIL),
      allowedEmail,
    });
    assert.equal(result.status, 403);
    assert.equal(result.databaseQueries, 0);
  assert.equal(result.transactions, 0);
  }
});

test("stats route validates the query only after the owner gate", async () => {
  const outsider = await callStatsRoute({
    session: sessionFor("someone@example.com"),
    allowedEmail: OWNER_EMAIL,
    query: "?checkpoint=not-a-checkpoint",
  });
  assert.equal(outsider.status, 403);

  const owner = await callStatsRoute({
    session: sessionFor(OWNER_EMAIL),
    allowedEmail: OWNER_EMAIL,
    query: "?checkpoint=not-a-checkpoint",
  });
  assert.equal(owner.status, 400);
  assert.equal(owner.databaseQueries, 0);
  assert.equal(owner.transactions, 0);
});

test("stats route serves the owner", async () => {
  const result = await callStatsRoute({
    session: sessionFor(OWNER_EMAIL),
    allowedEmail: OWNER_EMAIL,
    query: "?days=7",
  });
  assert.equal(result.status, 200);
  assert.equal(result.databaseQueries, 2);
  assert.equal(result.transactions, 1);
  assert.equal(result.statementTimeouts.length, 2);
  const [firstTimeout, secondTimeout] = result.statementTimeouts.map(Number);
  assert.ok(firstTimeout > JEV_STATS_STATEMENT_BUDGET_MS - 1_000);
  assert.ok(firstTimeout <= JEV_STATS_STATEMENT_BUDGET_MS);
  assert.ok(secondTimeout > 0 && secondTimeout <= firstTimeout);
  assert.deepEqual(result.transactionOptions, [
    {
      maxWait: JEV_STATS_TRANSACTION_MAX_WAIT_MS,
      timeout: JEV_STATS_TRANSACTION_TIMEOUT_MS,
    },
  ]);
  assert.deepEqual(result.body.checkpoints, []);
  assert.equal((result.body.window as { days: number }).days, 7);
});

test("stats route time budget holds every stats query inside the function limit", () => {
  assert.equal(maxDuration, JEV_STATS_ROUTE_MAX_DURATION_SECONDS);
  assert.ok(JEV_STATS_QUERY_DEADLINE_MS < maxDuration * 1_000);
});
