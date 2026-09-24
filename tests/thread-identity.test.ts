import test from "node:test";
import assert from "node:assert/strict";

import {
  deriveThreadId,
  isThreadIdForConversation,
} from "@/lib/orchestrator/threadIdentity";

test("root thread id derives and validates", () => {
  assert.equal(deriveThreadId("abc"), "conv-abc");
  assert.equal(isThreadIdForConversation("conv-abc", "abc"), true);
});

test("branch thread id derives and validates for its conversation", () => {
  const branchThread = deriveThreadId("abc", "branch-1");
  assert.equal(branchThread, "conv-abc:branch:branch-1");
  assert.equal(isThreadIdForConversation(branchThread, "abc"), true);
});

test("foreign root and branch threads are rejected", () => {
  assert.equal(isThreadIdForConversation("conv-other", "abc"), false);
  assert.equal(isThreadIdForConversation("conv-other:branch:x", "abc"), false);
});

test("a conversation id cannot forge the branch separator", () => {
  // encodeURIComponent escapes ':' so the encoded id can never inject a fake
  // ':branch:' boundary into another conversation's thread space.
  const root = deriveThreadId("a:b");
  assert.equal(root, "conv-a%3Ab");
  assert.equal(isThreadIdForConversation("conv-a%3Ab", "a:b"), true);
  assert.equal(isThreadIdForConversation("conv-a:branch:b", "a:b"), false);
});

test("malformed thread ids are rejected", () => {
  assert.equal(isThreadIdForConversation("", "abc"), false);
  assert.equal(isThreadIdForConversation("conv-abc:branch:", "abc"), false);
  assert.equal(isThreadIdForConversation("conv-abc:branch", "abc"), false);
  assert.equal(isThreadIdForConversation("conv-abcx:branch:y", "abc"), false);
  assert.equal(isThreadIdForConversation("garbage", "abc"), false);
});

test("long conversation and branch ids stay consistent through hash truncation", () => {
  const longConversation = "c".repeat(400);
  const longBranch = "b".repeat(400);
  const root = deriveThreadId(longConversation);
  const branch = deriveThreadId(longConversation, longBranch);
  assert.equal(isThreadIdForConversation(root, longConversation), true);
  assert.equal(isThreadIdForConversation(branch, longConversation), true);
  assert.equal(isThreadIdForConversation(branch, "other"), false);
});
