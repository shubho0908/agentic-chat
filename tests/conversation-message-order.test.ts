import test from "node:test";
import assert from "node:assert/strict";

import {
  compareConversationMessagesDesc,
  orderConversationMessagesAsc,
  orderConversationMessagesDesc,
} from "@/lib/conversationMessageOrder";

test("descending ordering keeps a pending assistant placeholder ahead of its triggering user in cache shape", () => {
  const userMessage = {
    id: "user-1",
    role: "user",
    createdAt: "2026-03-25T10:00:00.000Z",
  };
  const assistantPlaceholder = {
    id: "assistant-pending-conversation-1",
    role: "assistant",
    createdAt: "2026-03-25T10:00:01.000Z",
  };

  const ordered = orderConversationMessagesDesc([userMessage, assistantPlaceholder]);

  assert.deepEqual(ordered.map((message) => message.id), [
    assistantPlaceholder.id,
    userMessage.id,
  ]);
});

test("ascending ordering used by the UI restores the expected user-then-assistant flow", () => {
  const userMessage = {
    id: "user-1",
    role: "user",
    createdAt: "2026-03-25T10:00:00.000Z",
  };
  const assistantPlaceholder = {
    id: "assistant-pending-conversation-1",
    role: "assistant",
    createdAt: "2026-03-25T10:00:01.000Z",
  };

  const ordered = orderConversationMessagesAsc([assistantPlaceholder, userMessage]);

  assert.deepEqual(ordered.map((message) => message.id), [
    userMessage.id,
    assistantPlaceholder.id,
  ]);
});

test("role tie-break keeps user before assistant after the UI reverses identical timestamps", () => {
  const userMessage = {
    id: "user-1",
    role: "user",
    createdAt: "2026-03-25T10:00:00.000Z",
  };
  const assistantMessage = {
    id: "assistant-1",
    role: "assistant",
    createdAt: "2026-03-25T10:00:00.000Z",
  };

  assert.equal(compareConversationMessagesDesc(assistantMessage, userMessage), -1);
  assert.deepEqual(
    orderConversationMessagesAsc([assistantMessage, userMessage]).map((message) => message.id),
    [userMessage.id, assistantMessage.id]
  );
});
