import test from "node:test";
import assert from "node:assert/strict";

import { shouldAutoContinueConversation } from "@/hooks/chat/autoContinue";
import { STREAM_STOPPED_BY_USER_MARKER } from "@/lib/chat/stopMarker";
import { MessageRole, type Message } from "@/lib/schemas/chat";

function userMessage(id: string): Message {
  return { role: MessageRole.USER, content: "question", id, timestamp: 1 };
}

function assistantMessage(id: string, content: string, metadata?: Message["metadata"]): Message {
  return { role: MessageRole.ASSISTANT, content, id, timestamp: 2, ...(metadata && { metadata }) };
}

test("empty conversation never resumes", () => {
  assert.equal(shouldAutoContinueConversation([]), false);
});

test("conversation ending at a user message resumes (crash/server-fault case)", () => {
  assert.equal(shouldAutoContinueConversation([userMessage("u1")]), true);
});

test("empty assistant placeholder without content resumes", () => {
  assert.equal(
    shouldAutoContinueConversation([userMessage("u1"), assistantMessage("a1", "")]),
    true,
  );
});

test("a completed assistant answer does not resume", () => {
  assert.equal(
    shouldAutoContinueConversation([userMessage("u1"), assistantMessage("a1", "answer")]),
    false,
  );
});

test("a persisted stop marker never resumes, even after refresh", () => {
  const messages = [
    userMessage("u1"),
    assistantMessage("stopmsg-conv-1-u1", STREAM_STOPPED_BY_USER_MARKER),
  ];
  assert.equal(shouldAutoContinueConversation(messages), false);
});

test("a pending human-in-the-loop request never resumes", () => {
  const messages = [
    userMessage("u1"),
    assistantMessage("a1", "", {
      humanInTheLoopStatus: "pending",
      humanInTheLoopRequest: { type: "hitl_request" },
    } as Message["metadata"]),
  ];
  assert.equal(shouldAutoContinueConversation(messages), false);
});
