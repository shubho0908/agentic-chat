import test from "node:test";
import assert from "node:assert/strict";

import { readChatStream } from "@/hooks/chat/streamingApi";

const encoder = new TextEncoder();

function responseFor(...events: string[]): Response {
  return new Response(new ReadableStream({
    start(controller) {
      for (const event of events) controller.enqueue(encoder.encode(event));
      controller.close();
    },
  }), { status: 200 });
}

const callbacks = (chunks: string[], incomplete: string[]) => ({
  onChunk: (chunk: string) => chunks.push(chunk),
  onResponseIncomplete: (reason: "length") => incomplete.push(reason),
});

test("chat stream requires the DONE sentinel", async () => {
  const chunks: string[] = [];
  await assert.rejects(
    readChatStream(responseFor('data: {"content":"partial"}\n\n'), callbacks(chunks, [])),
    /ended before completion/,
  );
  assert.deepEqual(chunks, ["partial"]);
});

test("chat stream reports output-limit completion without discarding content", async () => {
  const chunks: string[] = [];
  const incomplete: string[] = [];
  const result = await readChatStream(responseFor(
    'data: {"content":"partial"}\n\n',
    'data: {"type":"response_incomplete","reason":"length"}\n\n',
    'data: [DONE]\n\n',
  ), callbacks(chunks, incomplete));
  assert.equal(result, "partial");
  assert.deepEqual(incomplete, ["length"]);
});

test("chat stream preserves chunks observed before an SSE error", async () => {
  const chunks: string[] = [];
  await assert.rejects(
    readChatStream(responseFor(
      'data: {"content":"partial"}\n\n',
      'data: {"error":"provider disconnected"}\n\n',
      'data: [DONE]\n\n',
    ), callbacks(chunks, [])),
    /provider disconnected/,
  );
  assert.deepEqual(chunks, ["partial"]);
});
