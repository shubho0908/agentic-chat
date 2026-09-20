/**
 * The Mem0 SDK search call accepts no AbortSignal; our transport
 * (lib/mem0Search.ts) issues the identical /v2/memories/search/ request
 * with the caller's signal so a timed-out or cancelled lookup actually
 * aborts instead of orphaning a background request. These tests pin the
 * request shape (SDK parity) and the cancellation semantics.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { searchMemoriesWithSignal } from "@/lib/mem0Search";

type FetchCall = { url: string; init: RequestInit };

function stubFetch(
  impl: (url: string, init: RequestInit) => Promise<Response>,
): () => FetchCall[] {
  const calls: FetchCall[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init: init ?? {} });
    return impl(url, init ?? {});
  }) as typeof fetch;
  return () => {
    globalThis.fetch = original;
    return calls;
  };
}

const CONFIG = {
  user_id: "user-1",
  mem0ApiKey: "test-key",
  top_k: 5,
  keyword_search: true,
  rerank: true,
  threshold: 0.15,
};

test("request mirrors the SDK shape and carries the caller's signal", async () => {
  const collect = stubFetch(async () => new Response('{"results":[]}'));
  const controller = new AbortController();
  const result = await searchMemoriesWithSignal("my stack", CONFIG, controller.signal);
  const calls = collect();

  assert.equal(calls.length, 1);
  const { url, init } = calls[0];
  assert.equal(url, "https://api.mem0.ai/v2/memories/search/");
  assert.equal(init.method, "POST");
  assert.equal((init.headers as Record<string, string>).Authorization, "Token test-key");
  assert.equal(init.signal, controller.signal, "the caller's signal reaches fetch");

  const body = JSON.parse(String(init.body));
  assert.equal(body.query, "my stack");
  assert.deepEqual(body.filters, { OR: [{ user_id: "user-1" }] });
  assert.equal(body.top_k, 5);
  assert.equal(body.version, "v2");
  assert.equal(body.output_format, "v1.1");
  assert.equal(body.keyword_search, true);
  assert.equal(body.rerank, true);
  assert.equal(body.threshold, 0.15);
  assert.ok(!("mem0ApiKey" in body), "API key never leaks into the request body");
  assert.ok(!("host" in body));
  assert.deepEqual(result, { results: [] });
});

test("aborting the signal aborts the in-flight request (no orphan)", async () => {
  const controller = new AbortController();
  const collect = stubFetch(
    (_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(init.signal?.reason), {
          once: true,
        });
      }),
  );
  const pending = searchMemoriesWithSignal("q", CONFIG, controller.signal);
  controller.abort(new DOMException("The operation timed out.", "TimeoutError"));
  await assert.rejects(pending, (err: unknown) => {
    assert.ok(err instanceof DOMException);
    assert.equal((err as DOMException).name, "TimeoutError");
    return true;
  });
  const calls = collect();
  assert.equal(calls.length, 1, "exactly one request was issued and it was the aborted one");
});

test("non-OK responses reject so the caller's allSettled logs the failure", async () => {
  const collect = stubFetch(async () => new Response("nope", { status: 500 }));
  await assert.rejects(
    searchMemoriesWithSignal("q", CONFIG, AbortSignal.timeout(1_000)),
    /HTTP 500/,
  );
  collect();
});

test("a custom host override is honored", async () => {
  const collect = stubFetch(async () => new Response("[]"));
  await searchMemoriesWithSignal("q", { ...CONFIG, host: "https://mem0.internal" }, new AbortController().signal);
  const calls = collect();
  assert.equal(calls[0].url, "https://mem0.internal/v2/memories/search/");
});
