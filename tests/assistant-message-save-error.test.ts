import assert from "node:assert/strict";
import test from "node:test";
import { saveAssistantMessage } from "@/hooks/chat/messageApi";
import { logger } from "@/lib/logger";

test("assistant save logs HTTP status and response error rather than only generic statusText", async () => {
  const originalFetch = globalThis.fetch;
  const originalError = logger.error;
  let logged = "";
  globalThis.fetch = (async () => new Response(JSON.stringify({ error: "transaction failed" }), {
    status: 500, headers: { "Content-Type": "application/json" },
  })) as typeof fetch;
  logger.error = ((...args: unknown[]) => { logged = args.map(String).join(" "); }) as typeof logger.error;
  try {
    assert.equal(await saveAssistantMessage("conv", "hello"), null);
    assert.match(logged, /500/);
    assert.match(logged, /transaction failed/);
  } finally {
    globalThis.fetch = originalFetch;
    logger.error = originalError;
  }
});
