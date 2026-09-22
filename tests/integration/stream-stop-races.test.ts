/**
 * Integration-level proof for the two stop-marker races closed on this
 * branch. Each test drives the REAL production decision functions
 * (markStreamStoppedByUser, parseStreamStoppedMarkerMessageId,
 * isStreamStoppedMarkerMessage, shouldAutoContinueConversation) over a
 * stateful in-memory message store that enforces the same semantics Postgres
 * gives the routes (row identity, createdAt ordering, skipDuplicates). What
 * this proves: the exact multi-request orderings the endpoints interleave
 * cannot lose a valid completion and cannot turn a disconnect into a stop.
 * What it does not prove: the Next.js/HTTP wiring itself (no live server or
 * database here) - that layer is covered by the source-guard tests below and
 * the route code review, mirroring the honesty convention in
 * tests/integration/README.md.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { markStreamStoppedByUser } from "@/lib/chat/streamStopped";
import {
  STREAM_STOPPED_BY_USER_MARKER,
  getStreamStoppedMarkerMessageId,
  parseStreamStoppedMarkerMessageId,
  isStreamStoppedMarkerMessage,
} from "@/lib/chat/stopMarker";
import { shouldAutoContinueConversation } from "@/hooks/chat/autoContinue";
import { MessageRole, type Message } from "@/lib/schemas/chat";

interface FakeRow {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  createdAt: number;
  parentMessageId: string | null;
  isDeleted: boolean;
}

function createStore() {
  const rows: FakeRow[] = [];
  let clock = 0;
  const insert = (id: string, conversationId: string, role: string, content: string) => {
    rows.push({ id, conversationId, role, content, createdAt: ++clock, parentMessageId: null, isDeleted: false });
  };
  const latestRoot = (conversationId: string) => {
    const matches = rows.filter(
      (r) => r.conversationId === conversationId && !r.isDeleted && r.parentMessageId === null,
    );
    matches.sort((a, b) => b.createdAt - a.createdAt);
    return matches[0] ?? null;
  };
  const db = {
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      const tx = {
        $executeRaw: async () => 1,
        message: {
          findUnique: async ({ where }: { where: { id: string } }) => {
            const row = rows.find((r) => r.id === where.id);
            return row ? { id: row.id, role: row.role, conversationId: row.conversationId } : null;
          },
          findFirst: async ({ where }: { where: { conversationId: string } }) => {
            const row = latestRoot(where.conversationId);
            return row ? { id: row.id, role: row.role, content: row.content } : null;
          },
          createMany: async ({
            data,
          }: {
            data: Array<{ id: string; conversationId: string; role: "ASSISTANT"; content: string }>;
          }) => {
            for (const d of data) {
              if (!rows.some((r) => r.id === d.id)) insert(d.id, d.conversationId, d.role, d.content);
            }
            return { count: data.length };
          },
        },
      };
      return fn(tx);
    },
  };
  return { rows, insert, latestRoot, db };
}

const FAST = { notFoundRetries: 3, retryDelayMs: 1 };

/** The exact decision the messages route makes for an ASSISTANT completion POST. */
function completionDecision(store: ReturnType<typeof createStore>, conversationId: string): "save" | "drop" {
  return isStreamStoppedMarkerMessage(store.latestRoot(conversationId)) ? "drop" : "save";
}

test("race: old turn's fallback stop POST after a newer turn must not mark or drop the new completion", async () => {
  const store = createStore();

  // Turn A: user sends, stream runs, user hits stop (explicit, scoped).
  store.insert("u-a", "conv-1", "USER", "first question");
  const stopA = await markStreamStoppedByUser("conv-1", "u-a", FAST, store.db as never);
  assert.equal(stopA.marked, true);

  // The user immediately sends turn B (isLoading cleared right after stop).
  store.insert("u-b", "conv-1", "USER", "second question");

  // Turn A's fallback client marker save arrives late at the messages route:
  // the route derives the scoped id from body.id and honors it.
  const fallbackMarkerId = getStreamStoppedMarkerMessageId("conv-1", "u-a");
  const scopedId = parseStreamStoppedMarkerMessageId("conv-1", fallbackMarkerId);
  assert.equal(scopedId, "u-a");
  const fallback = await markStreamStoppedByUser("conv-1", scopedId as string, FAST, store.db as never);
  assert.equal(fallback.marked, false, "stale fallback must never mark the newer turn");
  assert.equal(fallback.reason, "superseded-by-newer-turn");

  // Turn B's completion POST: the route must save it, not drop it.
  assert.equal(completionDecision(store, "conv-1"), "save");
  store.insert("a-b", "conv-1", "ASSISTANT", "second answer");
  assert.equal(store.latestRoot("conv-1")?.content, "second answer");
});

test("race: explicit stop of the CURRENT turn still drops its late completion (control)", async () => {
  const store = createStore();
  store.insert("u-b", "conv-1", "USER", "question");
  const stop = await markStreamStoppedByUser("conv-1", "u-b", FAST, store.db as never);
  assert.equal(stop.marked, true);
  assert.equal(completionDecision(store, "conv-1"), "drop");
});

test("race: unscoped marker saves are impossible - malformed body.id yields no scoped id", () => {
  // The messages route refuses the marker write when this returns null.
  assert.equal(parseStreamStoppedMarkerMessageId("conv-1", "stopmsg-conv-9-u-a"), null);
  assert.equal(parseStreamStoppedMarkerMessageId("conv-1", "u-a"), null);
});

test("race: refresh/disconnect writes no marker, so auto-continue still resumes", () => {
  // Behavior half: after a plain disconnect the conversation still ends at
  // the user message with no marker, and the resume predicate fires.
  const postRefresh: Message[] = [
    { role: MessageRole.USER, content: "question", id: "u-1", timestamp: 1 },
  ];
  assert.equal(shouldAutoContinueConversation(postRefresh), true);

  const afterExplicitStop: Message[] = [
    { role: MessageRole.USER, content: "question", id: "u-1", timestamp: 1 },
    {
      role: MessageRole.ASSISTANT,
      content: STREAM_STOPPED_BY_USER_MARKER,
      id: "stopmsg-conv-1-u-1",
      timestamp: 2,
    },
  ];
  assert.equal(shouldAutoContinueConversation(afterExplicitStop), false);
});

test("guard: the stream handler's disconnect path cannot write stop markers", () => {
  // If a durable marker write ever returns to the transport-abort path,
  // refresh/refresh-resume breaks again - this tripwire fails the suite.
  const handlerSource = readFileSync(
    resolve(process.cwd(), "lib/orchestrator/handler.ts"),
    "utf8",
  );
  assert.equal(handlerSource.includes("markStreamStoppedByUser"), false);
  assert.equal(handlerSource.includes("streamStopped"), false);
});

test("guard: the messages route marks only scoped, explicit-stop saves", () => {
  const routeSource = readFileSync(
    resolve(process.cwd(), "app/api/conversations/[id]/messages/route.ts"),
    "utf8",
  );
  // The only marker write is the scoped client-save special case (the
  // import has no parenthesis, so this counts call sites only).
  const callSites = routeSource.split("markStreamStoppedByUser(").length - 1;
  assert.equal(callSites, 1, "expected exactly one scoped call site");
  // ...and no transport-disconnect hook may write markers.
  assert.equal(routeSource.includes("request.signal.aborted"), false);
  assert.equal(routeSource.includes("parseStreamStoppedMarkerMessageId"), true);
});

test("guard: the stop endpoint always names its turn", () => {
  const stopSource = readFileSync(
    resolve(process.cwd(), "app/api/chat/stop/route.ts"),
    "utf8",
  );
  assert.equal(stopSource.includes("Missing userMessageId"), true);
  assert.equal(/markStreamStoppedByUser\(\s*conversationId\s*\)/.test(stopSource), false);
});
