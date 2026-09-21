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

function stubFetch(
  handler: (url: string, init?: RequestInit) => Response | Promise<Response>
) {
  const original = globalThis.fetch;
  globalThis.fetch = ((url: unknown, init?: RequestInit) =>
    handler(String(url), init)) as typeof fetch;
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
  const calls: string[] = [];
  const restore = stubFetch((url, init) => {
    calls.push(`${init?.method ?? "GET"} ${url}`);
    if (url === "/api/conversations") return jsonResponse({ id: "conv-1" });
    if (url === "/api/conversations/conv-1/messages")
      return jsonResponse({ error: "nope" }, 400);
    if (url === "/api/conversations/conv-1")
      return jsonResponse({ success: true });
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

    assert.equal(result, null);
    assert.equal(created.length, 0);
    assert.deepEqual(ready, []);
    assert.ok(
      calls.includes("DELETE /api/conversations/conv-1"),
      `expected the empty conversation to be discarded, saw: ${calls.join(", ")}`
    );
  } finally {
    restore();
  }
});

test("new conversation: discards the row when the opening save aborts", async () => {
  const calls: string[] = [];
  const restore = stubFetch((url, init) => {
    calls.push(`${init?.method ?? "GET"} ${url}`);
    if (url === "/api/conversations") return jsonResponse({ id: "conv-1" });
    if (url === "/api/conversations/conv-1/messages") {
      throw Object.assign(new Error("aborted"), { name: "AbortError" });
    }
    if (url === "/api/conversations/conv-1")
      return jsonResponse({ success: true });
    throw new Error(`unexpected fetch: ${url}`);
  });
  try {
    const queryClient = new QueryClient();
    const ready: string[] = [];

    await assert.rejects(
      handleConversationSaving(
        true,
        null,
        "Hello there",
        "",
        Date.now(),
        queryClient,
        undefined,
        undefined,
        true,
        undefined,
        undefined,
        (id) => {
          ready.push(id);
        }
      ),
      (err: Error) => err.name === "AbortError"
    );

    assert.deepEqual(ready, []);
    assert.ok(
      calls.includes("DELETE /api/conversations/conv-1"),
      `expected the empty conversation to be discarded, saw: ${calls.join(", ")}`
    );
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
