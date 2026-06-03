import test from "node:test";
import assert from "node:assert/strict";

import { MessageRole, type Message } from "@/lib/schemas/chat";
import {
  appendMessagesDedupingIds,
  dedupeMessagesById,
  getPendingAssistantMessageId,
  replaceMessageId,
  updateMessageById,
  upsertMessageById,
} from "@/hooks/chat/pendingAssistant";

function createMessage(message: Partial<Message> & Pick<Message, "id" | "role" | "content">): Message {
  return {
    timestamp: Date.now(),
    ...message,
  };
}

test("pending assistant ids stay stable for a conversation scope", () => {
  assert.equal(
    getPendingAssistantMessageId("conversation-1"),
    "assistant-pending-conversation-1",
  );
});

test("appendMessagesDedupingIds replaces an existing pending assistant instead of duplicating it", () => {
  const pendingId = getPendingAssistantMessageId("conversation-1");
  const stalePending = createMessage({
    id: pendingId,
    role: MessageRole.ASSISTANT,
    content: "",
  });
  const userMessage = createMessage({
    id: "user-1",
    role: MessageRole.USER,
    content: "hello",
  });
  const nextPending = createMessage({
    id: pendingId,
    role: MessageRole.ASSISTANT,
    content: "",
    timestamp: Date.now() + 1,
  });

  const result = appendMessagesDedupingIds([stalePending], [userMessage, nextPending]);

  assert.deepEqual(result.map((message) => message.id), ["user-1", pendingId]);
});

test("updateMessageById updates one matching message and drops duplicate ids", () => {
  const pendingId = getPendingAssistantMessageId("conversation-1");
  const duplicateA = createMessage({
    id: pendingId,
    role: MessageRole.ASSISTANT,
    content: "",
  });
  const duplicateB = createMessage({
    id: pendingId,
    role: MessageRole.ASSISTANT,
    content: "",
  });

  const result = updateMessageById([duplicateA, duplicateB], pendingId, {
    content: "streamed",
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].content, "streamed");
});

test("upsertMessageById collapses duplicate existing placeholders", () => {
  const pendingId = getPendingAssistantMessageId("conversation-1");
  const result = upsertMessageById(
    [
      createMessage({ id: pendingId, role: MessageRole.ASSISTANT, content: "" }),
      createMessage({ id: pendingId, role: MessageRole.ASSISTANT, content: "" }),
    ],
    createMessage({ id: pendingId, role: MessageRole.ASSISTANT, content: "cached" }),
  );

  assert.deepEqual(result.map((message) => message.content), ["cached"]);
});

test("replaceMessageId keeps the active placeholder position and removes old/new duplicates", () => {
  const pendingId = getPendingAssistantMessageId("conversation-1");
  const savedId = "assistant-1";
  const result = replaceMessageId(
    [
      createMessage({ id: savedId, role: MessageRole.ASSISTANT, content: "old saved" }),
      createMessage({ id: "user-1", role: MessageRole.USER, content: "hello" }),
      createMessage({ id: pendingId, role: MessageRole.ASSISTANT, content: "streamed" }),
      createMessage({ id: pendingId, role: MessageRole.ASSISTANT, content: "duplicate" }),
    ],
    pendingId,
    savedId,
    { content: "streamed" },
  );

  assert.deepEqual(result.map((message) => message.id), ["user-1", savedId]);
  assert.equal(result[1].content, "streamed");
});

test("dedupeMessagesById preserves the newest occurrence of duplicate ids", () => {
  const result = dedupeMessagesById([
    createMessage({ id: "assistant-1", role: MessageRole.ASSISTANT, content: "old" }),
    createMessage({ id: "user-1", role: MessageRole.USER, content: "hello" }),
    createMessage({ id: "assistant-1", role: MessageRole.ASSISTANT, content: "new" }),
  ]);

  assert.deepEqual(result.map((message) => message.id), ["user-1", "assistant-1"]);
  assert.equal(result[1].content, "new");
});
