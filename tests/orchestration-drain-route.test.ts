import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

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
