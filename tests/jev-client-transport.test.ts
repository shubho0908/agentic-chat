import test from "node:test";
import assert from "node:assert/strict";

import { JevDecisionClient, JevInvalidResponseError } from "@/lib/jev/client";
import { JevCheckpoint } from "@/lib/jev/types";

function evalInput() {
  return {
    checkpoint: JevCheckpoint.PLANNER,
    schemaVersion: "1.0.0",
    state: { msg: "hello" },
    questions: { q: { type: "noul", instructions: "test" } },
    timeoutMs: 5_000,
    traceContext: { requestId: "test-req" },
  } as const;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("evaluate validates response shape and returns model version", async () => {
  const client = new JevDecisionClient({ apiKey: "t" });
  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    jsonResponse({
      model: "jev-1.13.0",
      answers: { q: { type: "noul", noul: 0.5 } },
      usage: { input_tokens: 10, output_tokens: 2 },
    })) as typeof fetch;
  try {
    const result = await client.evaluate(evalInput());
    assert.equal(result.modelVersion, "jev-1.13.0");
    assert.equal(result.answers.q.type, "noul");
    assert.ok(result.latencyMs >= 0);
  } finally {
    globalThis.fetch = original;
  }
});

test("evaluate rejects malformed answers (noul out of range)", async () => {
  const client = new JevDecisionClient({ apiKey: "t" });
  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    jsonResponse({
      model: "jev-1.13.0",
      answers: { q: { type: "noul", noul: 42 } },
    })) as typeof fetch;
  try {
    await assert.rejects(
      () => client.evaluate(evalInput()),
      JevInvalidResponseError,
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("evaluate rejects empty answers object", async () => {
  const client = new JevDecisionClient({ apiKey: "t" });
  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    jsonResponse({ model: "jev-1.13.0", answers: {} })) as typeof fetch;
  try {
    await assert.rejects(
      () => client.evaluate(evalInput()),
      JevInvalidResponseError,
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("evaluate rejects non-object response", async () => {
  const client = new JevDecisionClient({ apiKey: "t" });
  const original = globalThis.fetch;
  globalThis.fetch = (async () => jsonResponse("nope")) as typeof fetch;
  try {
    await assert.rejects(
      () => client.evaluate(evalInput()),
      JevInvalidResponseError,
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("evaluate surfaces HTTP errors", async () => {
  const client = new JevDecisionClient({ apiKey: "t" });
  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response("rate limited", { status: 429 })) as typeof fetch;
  try {
    await assert.rejects(() => client.evaluate(evalInput()));
  } finally {
    globalThis.fetch = original;
  }
});

test("evaluate sends the correct request shape", async () => {
  const client = new JevDecisionClient({ apiKey: "tok-1" });
  const original = globalThis.fetch;
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;
  globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
    capturedUrl = String(url);
    capturedInit = init;
    return jsonResponse({
      model: "jev-latest",
      answers: { q: { type: "noul", noul: 0.9 } },
    });
  }) as typeof fetch;
  try {
    await client.evaluate(evalInput());
    assert.equal(capturedUrl, "https://api.typesafe.ai/v1/systemone");
    const headers = capturedInit?.headers as Record<string, string>;
    assert.equal(headers.Authorization, "Bearer tok-1");
    const body = JSON.parse(String(capturedInit?.body));
    assert.equal(body.model, "jev-latest");
    assert.deepEqual(body.state, { msg: "hello" });
    assert.equal(body.questions.q.type, "noul");
  } finally {
    globalThis.fetch = original;
  }
});
