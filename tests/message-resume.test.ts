import test from "node:test";
import assert from "node:assert/strict";

import { getResumeConversationState } from "@/hooks/chat/resumeState";
import type { Message } from "@/lib/schemas/chat";

function createMessage(message: Partial<Message> & Pick<Message, "id" | "role" | "content">): Message {
  return {
    timestamp: Date.now(),
    ...message,
  };
}

test("resume state removes a pending assistant placeholder that appears before the user message", () => {
  const userMessage = createMessage({
    id: "user-1",
    role: "user",
    content: "Plan my week",
  });
  const assistantPlaceholder = createMessage({
    id: "assistant-pending-conversation-1",
    role: "assistant",
    content: "",
  });

  const result = getResumeConversationState([assistantPlaceholder, userMessage], userMessage.id);

  assert.deepEqual(result.contextMessages, []);
  assert.equal(result.existingAssistantMessageId, assistantPlaceholder.id);
});

test("resume state removes the resumed user message from API context", () => {
  const earlierUser = createMessage({
    id: "user-0",
    role: "user",
    content: "Earlier question",
  });
  const earlierAssistant = createMessage({
    id: "assistant-0",
    role: "assistant",
    content: "Earlier answer",
  });
  const resumedUser = createMessage({
    id: "user-1",
    role: "user",
    content: "Follow-up question",
  });
  const assistantPlaceholder = createMessage({
    id: "assistant-pending-conversation-1",
    role: "assistant",
    content: "",
  });

  const result = getResumeConversationState(
    [earlierUser, earlierAssistant, resumedUser, assistantPlaceholder],
    resumedUser.id
  );

  assert.deepEqual(result.contextMessages, [earlierUser, earlierAssistant]);
  assert.equal(result.existingAssistantMessageId, assistantPlaceholder.id);
});

test("resume state keeps prior context when there is no pending assistant placeholder", () => {
  const earlierUser = createMessage({
    id: "user-0",
    role: "user",
    content: "Earlier question",
  });
  const resumedUser = createMessage({
    id: "user-1",
    role: "user",
    content: "Retry this send",
  });

  const result = getResumeConversationState([earlierUser, resumedUser], resumedUser.id);

  assert.deepEqual(result.contextMessages, [earlierUser]);
  assert.equal(result.existingAssistantMessageId, undefined);
});
