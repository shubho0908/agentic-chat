import test from "node:test";
import assert from "node:assert/strict";

import { markStreamStoppedByUser } from "@/lib/chat/streamStopped";
import {
  STREAM_STOPPED_BY_USER_MARKER,
  getStreamStoppedMarkerMessageId,
} from "@/lib/chat/stopMarker";

interface FakeState {
  executeRawCalls: number;
  createManyCalls: Array<{
    data: Array<{ id: string; conversationId: string; role: string; content: string }>;
    skipDuplicates: boolean;
  }>;
}

function createFakeDb(
  latestMessage: { id: string; role: string; content: string } | null,
) {
  const state: FakeState = { executeRawCalls: 0, createManyCalls: [] };
  const tx = {
    $executeRaw: async () => {
      state.executeRawCalls += 1;
      return 1;
    },
    message: {
      findFirst: async () => latestMessage,
      createMany: async (args: FakeState["createManyCalls"][number]) => {
        state.createManyCalls.push(args);
        return { count: args.data.length };
      },
    },
  };
  const db = { $transaction: async <T,>(fn: (t: typeof tx) => Promise<T>) => fn(tx) };
  return { state, db };
}

test("marker id is deterministic per conversation and user message", () => {
  assert.equal(
    getStreamStoppedMarkerMessageId("conv-1", "msg-1"),
    "stopmsg-conv-1-msg-1",
  );
});

test("writes the marker when the conversation ends at the user message", async () => {
  const { state, db } = createFakeDb({ id: "msg-1", role: "USER", content: "hi" });
  const result = await markStreamStoppedByUser("conv-1", undefined, db as never);
  assert.equal(result.marked, true);
  assert.equal(result.messageId, "stopmsg-conv-1-msg-1");
  assert.equal(state.executeRawCalls, 1);
  assert.equal(state.createManyCalls.length, 1);
  const write = state.createManyCalls[0];
  assert.equal(write.skipDuplicates, true);
  assert.equal(write.data[0].content, STREAM_STOPPED_BY_USER_MARKER);
  assert.equal(write.data[0].role, "ASSISTANT");
});

test("first-writer-wins: a finalized completion blocks the marker", async () => {
  const { state, db } = createFakeDb({
    id: "msg-2",
    role: "ASSISTANT",
    content: "Here is your answer.",
  });
  const result = await markStreamStoppedByUser("conv-1", undefined, db as never);
  assert.equal(result.marked, false);
  assert.equal(result.reason, "turn-already-finalized");
  assert.equal(state.createManyCalls.length, 0);
});

test("idempotent: an existing marker blocks a duplicate marker", async () => {
  const { state, db } = createFakeDb({
    id: "stopmsg-conv-1-msg-1",
    role: "ASSISTANT",
    content: STREAM_STOPPED_BY_USER_MARKER,
  });
  const result = await markStreamStoppedByUser("conv-1", undefined, db as never);
  assert.equal(result.marked, false);
  assert.equal(state.createManyCalls.length, 0);
});

test("no messages means nothing to mark", async () => {
  const { state, db } = createFakeDb(null);
  const result = await markStreamStoppedByUser("conv-1", undefined, db as never);
  assert.equal(result.marked, false);
  assert.equal(result.reason, "no-messages");
  assert.equal(state.createManyCalls.length, 0);
});

test("turn-scoped: writes when the expected user message is the latest", async () => {
  const { state, db } = createFakeDb({ id: "msg-1", role: "USER", content: "hi" });
  const result = await markStreamStoppedByUser("conv-1", "msg-1", db as never);
  assert.equal(result.marked, true);
  assert.equal(result.messageId, "stopmsg-conv-1-msg-1");
  assert.equal(state.createManyCalls.length, 1);
});

test("turn-scoped: a newer turn blocks the stop of an older stream", async () => {
  const { state, db } = createFakeDb({ id: "msg-2", role: "USER", content: "newer turn" });
  const result = await markStreamStoppedByUser("conv-1", "msg-1", db as never);
  assert.equal(result.marked, false);
  assert.equal(result.reason, "superseded-by-newer-turn");
  assert.equal(state.createManyCalls.length, 0);
});

test("turn-scoped: an expected id naming a finalized assistant turn never marks", async () => {
  const { state, db } = createFakeDb({
    id: "msg-2",
    role: "ASSISTANT",
    content: "already answered",
  });
  const result = await markStreamStoppedByUser("conv-1", "msg-2", db as never);
  assert.equal(result.marked, false);
  assert.equal(result.reason, "turn-already-finalized");
  assert.equal(state.createManyCalls.length, 0);
});

test("turn-scoped: a finalized newer turn also blocks the stale stop", async () => {
  const { state, db } = createFakeDb({
    id: "msg-3",
    role: "ASSISTANT",
    content: "newer answer",
  });
  const result = await markStreamStoppedByUser("conv-1", "msg-1", db as never);
  assert.equal(result.marked, false);
  assert.equal(result.reason, "superseded-by-newer-turn");
  assert.equal(state.createManyCalls.length, 0);
});
