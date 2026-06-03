import test from "node:test";
import assert from "node:assert/strict";

import { createSafeStream } from "@/lib/chat/safeStream";

const encoder = new TextEncoder();

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

test("safe stream ignores enqueue and close after abort", () => {
  const abortController = new AbortController();
  const controllerState = createController();
  const stream = createSafeStream(controllerState.controller, {
    abortSignal: abortController.signal,
    label: "safe-stream-test",
  });

  assert.equal(stream.enqueue(encoder.encode("before")), true);

  abortController.abort();

  assert.equal(stream.enqueue(encoder.encode("after")), false);
  assert.equal(stream.finish({ done: encoder.encode("done") }), false);
  assert.equal(stream.close(), false);
  assert.equal(controllerState.chunks.length, 1);
  assert.equal(controllerState.closeCount, 0);
  assert.equal(stream.isAborted, true);
  assert.equal(stream.isFinalized, true);
});

test("safe stream finalizes exactly once", () => {
  const controllerState = createController();
  const stream = createSafeStream(controllerState.controller, {
    label: "safe-stream-test",
  });

  assert.equal(stream.finish({ done: encoder.encode("done") }), true);
  assert.equal(stream.enqueue(encoder.encode("late")), false);
  assert.equal(stream.close(), false);
  assert.equal(controllerState.chunks.length, 1);
  assert.equal(controllerState.closeCount, 1);
});

test("safe stream treats an already-closed controller as terminal", () => {
  let enqueueCount = 0;
  let closeCount = 0;
  const controller = {
    enqueue() {
      enqueueCount += 1;
      throw new TypeError("Invalid state: Controller is already closed");
    },
    close() {
      closeCount += 1;
    },
  } as unknown as ReadableStreamDefaultController;

  const stream = createSafeStream(controller, {
    label: "safe-stream-test",
  });

  assert.equal(stream.enqueue(encoder.encode("late")), false);
  assert.equal(stream.close(), false);
  assert.equal(enqueueCount, 1);
  assert.equal(closeCount, 0);
  assert.equal(stream.isFinalized, true);
});
