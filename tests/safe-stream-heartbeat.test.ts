import test from "node:test";
import assert from "node:assert/strict";

import { createSafeStream } from "@/lib/chat/safeStream";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function createController() {
  const chunks: Uint8Array[] = [];
  let closeCount = 0;
  const controller = {
    enqueue(chunk: Uint8Array) {
      chunks.push(chunk);
    },
    close() {
      closeCount += 1;
    },
  } as unknown as ReadableStreamDefaultController;
  return {
    controller,
    chunks,
    get closeCount() {
      return closeCount;
    },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("heartbeats are emitted as SSE comments while the stream is open", async () => {
  const state = createController();
  const stream = createSafeStream(state.controller, {
    label: "heartbeat-test",
    heartbeatIntervalMs: 10,
  });

  await sleep(35);
  stream.finish({ done: encoder.encode("data: [DONE]\n\n") });

  const heartbeats = state.chunks.filter(
    (chunk) => decoder.decode(chunk) === ":hb\n\n",
  );
  assert.ok(
    heartbeats.length >= 2,
    `expected at least 2 heartbeats, got ${heartbeats.length}`,
  );
});

test("heartbeats stop after finish and after abort", async () => {
  const finished = createController();
  const finishedStream = createSafeStream(finished.controller, {
    label: "heartbeat-finish-test",
    heartbeatIntervalMs: 10,
  });
  await sleep(25);
  finishedStream.finish();
  const countAfterFinish = finished.chunks.length;
  await sleep(35);
  assert.equal(finished.chunks.length, countAfterFinish);

  const aborted = createController();
  const abortController = new AbortController();
  createSafeStream(aborted.controller, {
    abortSignal: abortController.signal,
    label: "heartbeat-abort-test",
    heartbeatIntervalMs: 10,
  });
  await sleep(25);
  abortController.abort();
  const countAfterAbort = aborted.chunks.length;
  await sleep(35);
  assert.equal(aborted.chunks.length, countAfterAbort);
});

test("no heartbeat option means no heartbeat chunks", async () => {
  const state = createController();
  const stream = createSafeStream(state.controller, {
    label: "no-heartbeat-test",
  });
  await sleep(30);
  assert.equal(state.chunks.length, 0);
  stream.finish();
});
