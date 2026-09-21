import test from "node:test";
import assert from "node:assert/strict";
import { QueryClient } from "@tanstack/react-query";

import { handleConversationSaving } from "@/hooks/chat/conversationManager";
import { queryKeys } from "@/lib/queryKeys";
import type { ConversationResult } from "@/types/chat";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function stubFetch(handler: (url: string) => Response | Promise<Response>) {
  const original = globalThis.fetch;
  globalThis.fetch = ((url: unknown) =>
    handler(String(url))) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

test("new conversation: returns the creation result and pre-populates cache (early create)", async () => {
  const restore = stubFetch((url) => {
    if (url === "/api/conversations") return jsonResponse({ id: "conv-1" });
    if (url === "/api/conversations/conv-1/messages")
      return jsonResponse({ id: "user-msg-1", attachments: [] });
    throw new Error(`unexpected fetch: ${url}`);
  });
  try {
    const queryClient = new QueryClient();
    const created: ConversationResult[] = [];
    const ready: string[] = [];

    const result = await handleConversationSaving(
      true,
      null,
      "Hello there",
      "",
      Date.now(),
      queryClient,
      (data) => {
        created.push(data);
      },
      undefined,
      true,
      undefined,
      undefined,
      (id) => {
        ready.push(id);
      }
    );

    assert.deepEqual(result, {
      conversationId: "conv-1",
      userMessageId: "user-msg-1",
      assistantMessageId: "",
    });
    assert.deepEqual(ready, ["conv-1"]);
    assert.equal(created.length, 1);

    const cached = queryClient.getQueryData<{
      pages: Array<{ messages: { items: Array<{ id: string }> } }>;
    }>(queryKeys.conversation("conv-1"));
    const itemIds =
      cached?.pages[0]?.messages.items.map((item) => item.id) ?? [];
    // Stored newest-first (API desc convention); readers re-sort ascending
    // via orderConversationMessagesAsc before rendering.
    assert.deepEqual(itemIds, ["assistant-pending-conv-1", "user-msg-1"]);
  } finally {
    restore();
  }
});

test("new conversation: returns null without onConversationCreated when the user message cannot persist", async () => {
  const restore = stubFetch((url) => {
    if (url === "/api/conversations") return jsonResponse({ id: "conv-1" });
    if (url === "/api/conversations/conv-1/messages")
      return jsonResponse({ error: "nope" }, 400);
    throw new Error(`unexpected fetch: ${url}`);
  });
  try {
    const queryClient = new QueryClient();
    const created: ConversationResult[] = [];
    const ready: string[] = [];

    const result = await handleConversationSaving(
      true,
      null,
      "Hello there",
      "",
      Date.now(),
      queryClient,
      (data) => {
        created.push(data);
      },
      undefined,
      true,
      undefined,
      undefined,
      (id) => {
        ready.push(id);
      }
    );

    // Row exists (ready fired) but the message did not persist: callers must
    // treat null as failure instead of navigating.
    assert.equal(result, null);
    assert.equal(created.length, 0);
    assert.deepEqual(ready, ["conv-1"]);
  } finally {
    restore();
  }
});

test("new conversation: returns null when conversation creation itself fails", async () => {
  const restore = stubFetch((url) => {
    if (url === "/api/conversations")
      return jsonResponse({ error: "db down" }, 500);
    throw new Error(`unexpected fetch: ${url}`);
  });
  try {
    const queryClient = new QueryClient();
    const created: ConversationResult[] = [];

    const result = await handleConversationSaving(
      true,
      null,
      "Hello there",
      "",
      Date.now(),
      queryClient,
      (data) => {
        created.push(data);
      },
      undefined,
      true
    );

    assert.equal(result, null);
    assert.equal(created.length, 0);
  } finally {
    restore();
  }
});
