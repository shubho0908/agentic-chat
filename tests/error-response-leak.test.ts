import test from "node:test";
import assert from "node:assert/strict";

import { errorResponse } from "@/lib/apiUtils";

async function readJsonBody(response: Response): Promise<{ error?: string; message?: string }> {
  return JSON.parse(await response.text()) as { error?: string; message?: string };
}

test("errorResponse never echoes internal error details in production", async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  (process.env as Record<string, string | undefined>).NODE_ENV = "production";
  try {
    const response = errorResponse("Friendly error", "internal-stack-trace-with-PII", 500);
    const body = await readJsonBody(response);
    assert.equal(body.error, "Friendly error");
    assert.equal(body.message, undefined, "internal message must not leak in production");
  } finally {
    (process.env as Record<string, string | undefined>).NODE_ENV = previousNodeEnv;
  }
});

test("errorResponse retains debug detail outside production", async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  (process.env as Record<string, string | undefined>).NODE_ENV = "development";
  try {
    const response = errorResponse("Friendly error", "debug-detail", 500);
    const body = await readJsonBody(response);
    assert.equal(body.error, "Friendly error");
    assert.equal(body.message, "debug-detail");
  } finally {
    (process.env as Record<string, string | undefined>).NODE_ENV = previousNodeEnv;
  }
});
