import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { GET } from "@/app/api/jev/stats/route";
import {
  JEV_STATS_ALLOWED_EMAIL_ENV,
  JEV_STATS_CACHE_TTL_ENV,
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
  const originalQuery = client.$queryRawUnsafe;
  let databaseQueries = 0;
  client.$queryRawUnsafe = async () => {
    databaseQueries += 1;
    return [];
  };

  try {
    const response = await GET(
      new NextRequest(`http://localhost/api/jev/stats${options.query ?? ""}`),
    );
    return {
      status: response.status,
      body: (await response.json()) as Record<string, unknown>,
      databaseQueries,
    };
  } finally {
    client.$queryRawUnsafe = originalQuery;
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
});

test("stats route rejects a signed-in non-owner before any stats query", async () => {
  const result = await callStatsRoute({
    session: sessionFor("someone@example.com"),
    allowedEmail: OWNER_EMAIL,
  });
  assert.equal(result.status, 403);
  assert.equal(result.databaseQueries, 0);
});

test("stats route denies everyone when the owner email is unset or blank", async () => {
  for (const allowedEmail of [undefined, "", "   "]) {
    const result = await callStatsRoute({
      session: sessionFor(OWNER_EMAIL),
      allowedEmail,
    });
    assert.equal(result.status, 403);
    assert.equal(result.databaseQueries, 0);
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
});

test("stats route serves the owner", async () => {
  const result = await callStatsRoute({
    session: sessionFor(OWNER_EMAIL),
    allowedEmail: OWNER_EMAIL,
    query: "?days=7",
  });
  assert.equal(result.status, 200);
  assert.equal(result.databaseQueries, 2);
  assert.deepEqual(result.body.checkpoints, []);
  assert.equal((result.body.window as { days: number }).days, 7);
});
