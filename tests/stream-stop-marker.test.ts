import test from "node:test";
import assert from "node:assert/strict";

import { markStreamStoppedByUser } from "@/lib/chat/streamStopped";
import {
  STREAM_STOPPED_BY_USER_MARKER,
  getStreamStoppedMarkerMessageId,
  parseStreamStoppedMarkerMessageId,
  isStreamStoppedMarkerMessage,
} from "@/lib/chat/stopMarker";

interface FakeRow {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  createdAt: number;
  parentMessageId: string | null;
  isDeleted: boolean;
}

function createFakeDb(initialRows: FakeRow[] = []) {
  const rows = [...initialRows];
  const findUniqueCalls: string[] = [];
  let clock = initialRows.length;
  const db = {
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      const tx = {
        $executeRaw: async () => 1,
        message: {
          findUnique: async ({ where }: { where: { id: string } }) => {
            findUniqueCalls.push(where.id);
            const row = rows.find((r) => r.id === where.id);
            return row
              ? { id: row.id, role: row.role, conversationId: row.conversationId }
              : null;
          },
          findFirst: async ({
            where,
          }: {
            where: { conversationId: string; isDeleted: boolean; parentMessageId: null };
          }) => {
            const matches = rows.filter(
              (r) =>
                r.conversationId === where.conversationId &&
                r.isDeleted === where.isDeleted &&
                r.parentMessageId === null,
            );
            matches.sort((a, b) => b.createdAt - a.createdAt);
            const row = matches[0];
            return row ? { id: row.id, role: row.role, content: row.content } : null;
          },
          createMany: async ({
            data,
            skipDuplicates,
          }: {
            data: Array<{ id: string; conversationId: string; role: "ASSISTANT"; content: string }>;
            skipDuplicates: boolean;
          }) => {
            for (const row of data) {
              if (skipDuplicates && rows.some((r) => r.id === row.id)) continue;
              rows.push({
                ...row,
                createdAt: ++clock,
                parentMessageId: null,
                isDeleted: false,
              });
            }
            return { count: data.length };
          },
        },
      };
      return fn(tx);
    },
  };
  return { rows, db, findUniqueCalls };
}

function row(id: string, role: string, content: string, createdAt: number, conversationId = "conv-1"): FakeRow {
  return { id, conversationId, role, content, createdAt, parentMessageId: null, isDeleted: false };
}

const FAST = { notFoundRetries: 3, retryDelayMs: 1 };

test("marks the open turn named by the scoped user message id", async () => {
  const { rows, db } = createFakeDb([row("msg-1", "USER", "hi", 1)]);
  const result = await markStreamStoppedByUser("conv-1", "msg-1", FAST, db as never);
  assert.equal(result.marked, true);
  assert.equal(result.messageId, "stopmsg-conv-1-msg-1");
  assert.equal(rows.length, 2);
  assert.equal(rows[1].content, STREAM_STOPPED_BY_USER_MARKER);
});

test("re-marking an already-marked turn is idempotent", async () => {
  const { rows, db } = createFakeDb([
    row("msg-1", "USER", "hi", 1),
    row("stopmsg-conv-1-msg-1", "ASSISTANT", STREAM_STOPPED_BY_USER_MARKER, 2),
  ]);
  const result = await markStreamStoppedByUser("conv-1", "msg-1", FAST, db as never);
  assert.equal(result.marked, true);
  assert.equal(result.messageId, "stopmsg-conv-1-msg-1");
  assert.equal(rows.length, 2, "no duplicate marker row");
});

test("a newer user turn supersedes the stop of an older stream", async () => {
  const { rows, db } = createFakeDb([
    row("msg-1", "USER", "older", 1),
    row("msg-2", "USER", "newer turn", 2),
  ]);
  const result = await markStreamStoppedByUser("conv-1", "msg-1", FAST, db as never);
  assert.equal(result.marked, false);
  assert.equal(result.reason, "superseded-by-newer-turn");
  assert.equal(rows.length, 2);
});

test("a finalized newer turn also blocks the stale stop", async () => {
  const { rows, db } = createFakeDb([
    row("msg-1", "USER", "older", 1),
    row("msg-3", "ASSISTANT", "newer answer", 2),
  ]);
  const result = await markStreamStoppedByUser("conv-1", "msg-1", FAST, db as never);
  assert.equal(result.marked, false);
  assert.equal(result.reason, "turn-already-finalized");
  assert.equal(rows.length, 2);
});

test("an expected id naming an assistant message never marks", async () => {
  const { rows, db } = createFakeDb([row("msg-2", "ASSISTANT", "already answered", 1)]);
  const result = await markStreamStoppedByUser("conv-1", "msg-2", FAST, db as never);
  assert.equal(result.marked, false);
  assert.equal(result.reason, "turn-already-finalized");
  assert.equal(rows.length, 1);
});

test("a user message from another conversation is never marked", async () => {
  const { rows, db } = createFakeDb([row("msg-9", "USER", "other conv", 1, "conv-2")]);
  const result = await markStreamStoppedByUser("conv-1", "msg-9", FAST, db as never);
  assert.equal(result.marked, false);
  assert.equal(result.reason, "user-message-not-found");
  assert.equal(rows.length, 1);
});

test("stop while the user-message save is in flight: waits, then marks", async () => {
  // The row appears only on the 3rd lookup, simulating the save landing
  // between the stop request's attempts.
  const { rows, db, findUniqueCalls } = createFakeDb();
  let lookups = 0;
  const origTransaction = db.$transaction;
  const instrumentedDb = {
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      lookups += 1;
      if (lookups === 3) {
        rows.push(row("msg-1", "USER", "hi", 1));
      }
      return origTransaction(fn);
    },
  };
  const result = await markStreamStoppedByUser("conv-1", "msg-1", FAST, instrumentedDb as never);
  assert.equal(result.marked, true);
  assert.equal(findUniqueCalls.length, 3);
  assert.equal(rows.filter((r) => r.content === STREAM_STOPPED_BY_USER_MARKER).length, 1);
});

test("a missing user message after all retries is never marked", async () => {
  const { rows, db, findUniqueCalls } = createFakeDb();
  const result = await markStreamStoppedByUser("conv-1", "msg-1", FAST, db as never);
  assert.equal(result.marked, false);
  assert.equal(result.reason, "user-message-not-found");
  assert.equal(findUniqueCalls.length, FAST.notFoundRetries + 1);
  assert.equal(rows.length, 0);
});

test("marker id round-trips through parse", () => {
  const id = getStreamStoppedMarkerMessageId("conv-1", "msg-1");
  assert.equal(id, "stopmsg-conv-1-msg-1");
  assert.equal(parseStreamStoppedMarkerMessageId("conv-1", id), "msg-1");
});

test("parse rejects markers scoped to another conversation or malformed ids", () => {
  assert.equal(parseStreamStoppedMarkerMessageId("conv-1", "stopmsg-conv-2-msg-1"), null);
  assert.equal(parseStreamStoppedMarkerMessageId("conv-1", "stopmsg-conv-1-"), null);
  assert.equal(parseStreamStoppedMarkerMessageId("conv-1", "random-id"), null);
  assert.equal(parseStreamStoppedMarkerMessageId("conv-1", "msg-1"), null);
});

test("isStreamStoppedMarkerMessage identifies only the sentinel assistant row", () => {
  assert.equal(
    isStreamStoppedMarkerMessage({ role: "ASSISTANT", content: STREAM_STOPPED_BY_USER_MARKER }),
    true,
  );
  assert.equal(isStreamStoppedMarkerMessage({ role: "ASSISTANT", content: "answer" }), false);
  assert.equal(isStreamStoppedMarkerMessage({ role: "USER", content: STREAM_STOPPED_BY_USER_MARKER }), false);
  assert.equal(isStreamStoppedMarkerMessage(null), false);
  assert.equal(isStreamStoppedMarkerMessage(undefined), false);
});
