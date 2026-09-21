import test from "node:test";
import assert from "node:assert/strict";

import {
  JevDecisionClient,
  JevEvaluationCancelledError,
  JevEvaluationTimeoutError,
  JevInvalidResponseError,
  classifyJevFailure,
} from "@/lib/jev/client";
import { getCircuitBreaker } from "@/lib/circuitBreaker";
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

/** Records what the observability sink actually emits. Mirrors the real sink's
 *  level routing so assertions cover severity, not just message text. */
function captureLogs(): { entries: Array<Record<string, unknown>>; restore: () => void } {
  const entries: Array<Record<string, unknown>> = [];
  const original = { info: console.info, warn: console.warn, error: console.error };
  const record = (args: unknown[]) => {
    if (typeof args[0] !== "string") return;
    try {
      entries.push(JSON.parse(args[0]) as Record<string, unknown>);
    } catch {
      // Non-JSON writes (stack traces) are irrelevant here.
    }
  };

  console.info = (...args: unknown[]) => record(args);
  console.warn = (...args: unknown[]) => record(args);
  console.error = (...args: unknown[]) => record(args);

  return {
    entries,
    restore: () => {
      console.info = original.info;
      console.warn = original.warn;
      console.error = original.error;
    },
  };
}

/** Evaluations that miss their budget count as breaker failures, so tests that
 *  provoke them must not leak that state into the next test. */
function resetJevBreaker(): void {
  getCircuitBreaker("jev-decision-client").recordSuccess();
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

test("caller-cancelled evaluate rejects fast without counting against the breaker", async () => {
  const client = new JevDecisionClient({ apiKey: "t" });
  const breaker = getCircuitBreaker("jev-decision-client");

  const original = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    // Reset breaker accounting, then succeed.
    return jsonResponse({
      model: "jev-1.13.0",
      answers: { q: { type: "noul", noul: 0.5 } },
    });
  }) as typeof fetch;

  try {
    // A success first so the failure counter starts at zero.
    await client.evaluate(evalInput());
    assert.ok(breaker.canAttempt());

    const controller = new AbortController();
    controller.abort();
    fetchCalls = 0;
    for (let i = 0; i < 5; i++) {
      await assert.rejects(
        client.evaluate({ ...evalInput(), signal: controller.signal }),
        JevEvaluationCancelledError,
      );
    }
    assert.equal(fetchCalls, 0, "pre-cancelled calls never hit the network");
    assert.ok(
      breaker.canAttempt(),
      "five caller-cancelled calls must not open the breaker (threshold is 5)",
    );
    assert.equal(
      classifyJevFailure(new JevEvaluationCancelledError()),
      "cancelled",
      "cancellations stay distinguishable from provider faults",
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("an abort arriving mid-flight cancels the request", async () => {
  const client = new JevDecisionClient({ apiKey: "t" });
  const original = globalThis.fetch;
  globalThis.fetch = ((input: unknown, init?: RequestInit) =>
    new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener(
        "abort",
        () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        },
        { once: true },
      );
    })) as unknown as typeof fetch;

  try {
    const controller = new AbortController();
    const pending = client.evaluate({
      ...evalInput(),
      signal: controller.signal,
    });
    controller.abort();
    await assert.rejects(pending, JevEvaluationCancelledError);
  } finally {
    globalThis.fetch = original;
  }
});

test("a budget miss surfaces as a typed timeout, not a generic abort", async () => {
  const client = new JevDecisionClient({ apiKey: "t" });
  const original = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = ((_input: unknown, init?: RequestInit) =>
    new Promise<Response>((_, reject) => {
      fetchCalls += 1;
      init?.signal?.addEventListener(
        "abort",
        () => reject(init.signal?.reason),
        { once: true },
      );
    })) as unknown as typeof fetch;

  const logs = captureLogs();
  try {
    await assert.rejects(
      () => client.evaluate({ ...evalInput(), timeoutMs: 40 }),
      (error: unknown) => {
        assert.ok(error instanceof JevEvaluationTimeoutError);
        assert.match(error.message, /40ms budget/);
        assert.equal(classifyJevFailure(error), "timeout");
        return true;
      },
    );

    assert.equal(fetchCalls, 1, "a spent budget must not retry dead work");

    const failure = logs.entries.find(
      (entry) => entry.event === "jev_evaluate_failed",
    );
    assert.equal(failure?.level, "warn", "a budget miss is not fault-level");
    assert.equal(failure?.reason, "timeout");
    assert.equal(failure?.checkpoint, JevCheckpoint.PLANNER);
    assert.match(String(failure?.error), /40ms budget/);
    assert.notEqual(failure?.error, "Operation aborted");
    assert.equal(
      logs.entries.some((entry) => entry.level === "error"),
      false,
      "the failure that produced the original report was logged at error level",
    );
  } finally {
    logs.restore();
    globalThis.fetch = original;
    resetJevBreaker();
  }
});

test("a transport that ignores the deadline signal is still bounded", async () => {
  const client = new JevDecisionClient({ apiKey: "t" });
  const original = globalThis.fetch;
  globalThis.fetch = (() => new Promise<Response>(() => {})) as typeof fetch;

  const logs = captureLogs();
  try {
    await assert.rejects(
      () => client.evaluate({ ...evalInput(), timeoutMs: 40 }),
      JevEvaluationTimeoutError,
    );
  } finally {
    logs.restore();
    globalThis.fetch = original;
    resetJevBreaker();
  }
});

test("caller cancellation is logged below error level", async () => {
  const client = new JevDecisionClient({ apiKey: "t" });
  const original = globalThis.fetch;
  const originalVerbose = process.env.OBSERVABILITY_VERBOSE;
  globalThis.fetch = (async () =>
    jsonResponse({
      model: "jev-1.13.0",
      answers: { q: { type: "noul", noul: 0.5 } },
    })) as typeof fetch;

  const controller = new AbortController();
  controller.abort();
  const logs = captureLogs();
  try {
    process.env.OBSERVABILITY_VERBOSE = "true";
    await assert.rejects(
      client.evaluate({ ...evalInput(), signal: controller.signal }),
      JevEvaluationCancelledError,
    );

    assert.equal(
      logs.entries.some((entry) => entry.event === "jev_evaluate_failed"),
      false,
      "a cancelled evaluation is not a failed evaluation",
    );
    const cancelled = logs.entries.find(
      (entry) => entry.event === "jev_evaluate_cancelled",
    );
    assert.equal(cancelled?.level, "info");
  } finally {
    logs.restore();
    if (originalVerbose === undefined) {
      delete process.env.OBSERVABILITY_VERBOSE;
    } else {
      process.env.OBSERVABILITY_VERBOSE = originalVerbose;
    }
    globalThis.fetch = original;
    resetJevBreaker();
  }
});

test("classifyJevFailure maps every failure family a checkpoint can see", async () => {
  assert.equal(classifyJevFailure(new JevEvaluationTimeoutError(1_000)), "timeout");
  assert.equal(classifyJevFailure(new JevEvaluationCancelledError()), "cancelled");
  assert.equal(classifyJevFailure(new JevInvalidResponseError("bad shape")), "invalid");
  assert.equal(classifyJevFailure(new Error("provider down")), "error");
  assert.equal(classifyJevFailure("not an error"), "error");
  // Legacy abort shapes (DOMException, foreign clients) still read as timeouts.
  assert.equal(classifyJevFailure(new DOMException("x", "AbortError")), "timeout");
  assert.equal(
    classifyJevFailure(Object.assign(new Error("timeout"), { name: "AbortError" })),
    "timeout",
  );

  const breaker = getCircuitBreaker("jev-decision-client");
  const client = new JevDecisionClient({ apiKey: "t" });
  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    jsonResponse({ model: "m", answers: { q: { type: "noul", noul: 0.5 } } })) as typeof fetch;
  try {
    for (let i = 0; i < 5; i++) breaker.recordFailure();
    await assert.rejects(
      () => client.evaluate(evalInput()),
      (error: unknown) => classifyJevFailure(error) === "circuit_open",
    );
  } finally {
    globalThis.fetch = original;
    resetJevBreaker();
  }
});
