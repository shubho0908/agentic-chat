import test from "node:test";
import assert from "node:assert/strict";

import { prisma } from "@/lib/prisma";
import { deriveThreadId } from "@/lib/orchestrator/threadIdentity";
import {
  CHECKPOINT_PRUNE_MAX_THREADS,
  CHECKPOINT_STALE_AFTER_MS,
  conversationIdFromThreadId,
  deleteConversationCheckpoints,
  pruneCheckpointsOnSchedule,
} from "@/lib/orchestrator/checkpointPrune";

const SUNDAY = new Date("2026-09-27T00:00:00Z");
const MONDAY = new Date("2026-09-28T00:00:00Z");

interface PrismaStub {
  threadIds: string[];
  conversations: Array<{ id: string; updatedAt: Date }>;
  queries: Array<{ query: string; params: unknown[] }>;
  findManyCalls: number;
  failQuery?: boolean;
}

async function withPrisma<T>(stub: PrismaStub, fn: () => Promise<T>): Promise<T> {
  const client = prisma as unknown as Record<string, unknown>;
  const conversation = prisma.conversation as unknown as Record<string, unknown>;
  const originalQuery = client.$queryRawUnsafe;
  const originalFindMany = conversation.findMany;
  client.$queryRawUnsafe = async (query: string, ...params: unknown[]) => {
    stub.queries.push({ query, params });
    if (stub.failQuery) throw new Error("relation does not exist");
    const prefixes = params[0] as string[] | undefined;
    const rows = prefixes
      ? stub.threadIds.filter((id) => prefixes.some((prefix) => id.startsWith(prefix)))
      : stub.threadIds;
    return rows.map((thread_id) => ({ thread_id }));
  };
  conversation.findMany = async (args: { where: { id: { in: string[] } } }) => {
    stub.findManyCalls += 1;
    return stub.conversations.filter((row) => args.where.id.in.includes(row.id));
  };
  try {
    return await fn();
  } finally {
    client.$queryRawUnsafe = originalQuery;
    conversation.findMany = originalFindMany;
  }
}

function stub(partial: Partial<PrismaStub>): PrismaStub {
  return { threadIds: [], conversations: [], queries: [], findManyCalls: 0, ...partial };
}

function recordingDeleter(failOn: Set<string> = new Set()) {
  const deleted: string[] = [];
  return {
    deleted,
    async deleteThread(threadId: string) {
      if (failOn.has(threadId)) throw new Error("delete failed");
      deleted.push(threadId);
    },
  };
}

test("thread ids map back to their conversation, and foreign or hashed ids do not", () => {
  assert.equal(conversationIdFromThreadId(deriveThreadId("abc")), "abc");
  assert.equal(conversationIdFromThreadId(deriveThreadId("abc", "b-1")), "abc");
  assert.equal(conversationIdFromThreadId(deriveThreadId("a:b", "x")), "a:b");
  assert.equal(conversationIdFromThreadId("garbage"), null);
  assert.equal(conversationIdFromThreadId("conv-"), null);
  assert.equal(conversationIdFromThreadId("conv-%E0%A4%A"), null);
  assert.equal(conversationIdFromThreadId(deriveThreadId("x".repeat(400))), null);
});

test("prune does nothing outside Sunday UTC", async () => {
  const state = stub({ threadIds: [deriveThreadId("gone")] });
  const deleter = recordingDeleter();
  const result = await withPrisma(state, () => pruneCheckpointsOnSchedule(MONDAY, deleter));
  assert.equal(result.ran, false);
  assert.equal(state.queries.length, 0);
  assert.deepEqual(deleter.deleted, []);
});

test("prune deletes orphan and stale threads, keeps fresh ones, skips unparseable ids", async () => {
  const fresh = new Date(SUNDAY.getTime() - CHECKPOINT_STALE_AFTER_MS + 60_000);
  const stale = new Date(SUNDAY.getTime() - CHECKPOINT_STALE_AFTER_MS - 60_000);
  const state = stub({
    threadIds: [
      deriveThreadId("orphan"),
      deriveThreadId("orphan", "b-1"),
      deriveThreadId("old"),
      deriveThreadId("recent"),
      deriveThreadId("recent", "b-2"),
      "not-a-conversation-thread",
    ],
    conversations: [
      { id: "old", updatedAt: stale },
      { id: "recent", updatedAt: fresh },
    ],
  });
  const deleter = recordingDeleter();
  const result = await withPrisma(state, () => pruneCheckpointsOnSchedule(SUNDAY, deleter));
  assert.deepEqual(deleter.deleted.sort(), [
    deriveThreadId("old"),
    deriveThreadId("orphan"),
    deriveThreadId("orphan", "b-1"),
  ].sort());
  assert.deepEqual(result, {
    ran: true,
    scanned: 6,
    pruned: 3,
    kept: 2,
    skipped: 1,
    deferred: 0,
    failed: 0,
  });
  assert.match(state.queries[0]!.query, /FROM langgraph\.checkpoints/);
});

test("prune caps deletes per invocation and reports the rest as deferred", async () => {
  const total = CHECKPOINT_PRUNE_MAX_THREADS + 7;
  const state = stub({
    threadIds: Array.from({ length: total }, (_, index) => deriveThreadId(`orphan-${index}`)),
  });
  const deleter = recordingDeleter();
  const result = await withPrisma(state, () => pruneCheckpointsOnSchedule(SUNDAY, deleter));
  assert.equal(deleter.deleted.length, CHECKPOINT_PRUNE_MAX_THREADS);
  assert.equal(result.pruned, CHECKPOINT_PRUNE_MAX_THREADS);
  assert.equal(result.deferred, 7);
});

test("one failed thread delete does not stop the rest of the prune", async () => {
  const failing = deriveThreadId("orphan-a");
  const state = stub({ threadIds: [failing, deriveThreadId("orphan-b")] });
  const deleter = recordingDeleter(new Set([failing]));
  const result = await withPrisma(state, () => pruneCheckpointsOnSchedule(SUNDAY, deleter));
  assert.deepEqual(deleter.deleted, [deriveThreadId("orphan-b")]);
  assert.equal(result.pruned, 1);
  assert.equal(result.failed, 1);
});

test("prune reports failure instead of throwing when the checkpoint table is unreadable", async () => {
  const state = stub({ failQuery: true });
  const result = await withPrisma(state, () =>
    pruneCheckpointsOnSchedule(SUNDAY, recordingDeleter()),
  );
  assert.equal(result.ran, true);
  assert.equal(result.failed, 1);
  assert.equal(result.pruned, 0);
});

test("conversation delete removes its root and branch threads only", async () => {
  const state = stub({
    threadIds: [
      deriveThreadId("abc"),
      deriveThreadId("abc", "b-1"),
      "conv-abcd",
      deriveThreadId("other"),
    ],
  });
  const deleter = recordingDeleter();
  await withPrisma(state, () => deleteConversationCheckpoints(["abc"], deleter));
  assert.deepEqual(deleter.deleted.sort(), [
    deriveThreadId("abc"),
    deriveThreadId("abc", "b-1"),
  ].sort());
  assert.deepEqual(state.queries[0]!.params[0], [deriveThreadId("abc")]);
});

test("bulk conversation delete covers every conversation in one lookup", async () => {
  const state = stub({
    threadIds: [deriveThreadId("a"), deriveThreadId("b", "x"), deriveThreadId("c")],
  });
  const deleter = recordingDeleter();
  await withPrisma(state, () => deleteConversationCheckpoints(["a", "b"], deleter));
  assert.equal(state.queries.length, 1);
  assert.deepEqual(deleter.deleted.sort(), [deriveThreadId("a"), deriveThreadId("b", "x")].sort());
});

test("conversation checkpoint delete never throws", async () => {
  const state = stub({ failQuery: true });
  await withPrisma(state, () =>
    deleteConversationCheckpoints(["abc"], recordingDeleter()),
  );
  const failing = deriveThreadId("abc");
  const partial = stub({ threadIds: [failing] });
  await withPrisma(partial, () =>
    deleteConversationCheckpoints(["abc"], recordingDeleter(new Set([failing]))),
  );
});

test("conversation checkpoint delete skips work for an empty id list", async () => {
  const state = stub({});
  await withPrisma(state, () => deleteConversationCheckpoints([], recordingDeleter()));
  assert.equal(state.queries.length, 0);
});
