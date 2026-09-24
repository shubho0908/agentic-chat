import test from "node:test";
import assert from "node:assert/strict";

import { readChatStream } from "@/hooks/chat/streamingApi";

const encoder = new TextEncoder();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("a stream that goes silent rejects with a stall error instead of hanging", async () => {
  const response = new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"content":"partial"}\n\n'));
        // Never enqueues again and never closes: the hung-backend case.
      },
    }),
    { status: 200 },
  );

  const startedAt = Date.now();
  await assert.rejects(
    readChatStream(response, { onChunk: () => {} }, { stallTimeoutMs: 60 }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.name, "ChatStreamStallError");
      assert.match(error.message, /stopped arriving/i);
      return true;
    },
  );
  assert.ok(
    Date.now() - startedAt < 5_000,
    "watchdog must bound the wait, not spin forever",
  );
});

test("server heartbeat comments keep a slow-but-alive stream from stalling", async () => {
  const response = new Response(
    new ReadableStream({
      async start(controller) {
        // Five heartbeats 40ms apart: total stream time 200ms, well over the
        // 120ms watchdog, but bytes never stop for longer than 40ms.
        for (let beat = 0; beat < 5; beat += 1) {
          controller.enqueue(encoder.encode(":hb\n\n"));
          await sleep(40);
        }
        controller.enqueue(encoder.encode('data: {"content":"done"}\n\n'));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    }),
    { status: 200 },
  );

  const result = await readChatStream(
    response,
    { onChunk: () => {} },
    { stallTimeoutMs: 120 },
  );
  assert.equal(result, "done");
});

test("stall watchdog tolerates a stallTimeoutMs of zero as disabled", async () => {
  const response = new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"content":"ok"}\n\n'));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    }),
    { status: 200 },
  );

  const result = await readChatStream(
    response,
    { onChunk: () => {} },
    { stallTimeoutMs: 0 },
  );
  assert.equal(result, "ok");
});
