/**
 * Regression tests for Greptile finding "Recall Requests Skip Memory":
 * in the default OFF mode the gate must never answer shouldQuery:false to a
 * direct recall question. Covers every recalled-phrase class, English and
 * Hinglish, through the public mediateMemoryIntent path, plus negative
 * controls so generic questions still skip retrieval.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  isExplicitMemoryRecall,
  mediateMemoryIntent,
  MemoryGateReason,
} from "@/lib/jev/memoryGate";

const EXPLICIT_PHRASES = [
  "who am I?",
  "what did I ask you yesterday?",
  "what did I tell you last week?",
  "what did I say about the deployment?",
  "what did I share earlier?",
  "what is my latest project?",
  "do you remember my stack?",
  "kya tumhe yaad hai maine kya bola?",
  "maine kya pucha tha?",
  "maine kya bataya tha about my job?",
];

const LEGACY_ONLY_PHRASES = [
  "anything from yesterday about the plan?",
  "kal humne kya discuss kiya tha?",
];

const NON_RECALL_PHRASES = [
  "what is the capital of France?",
  "write a haiku about databases",
  "summarize this pull request",
];

test("explicit recall phrases short-circuit to EXPLICIT_RECALL", async (t) => {
  for (const phrase of EXPLICIT_PHRASES) {
    await t.test(phrase, async () => {
      const decision = await mediateMemoryIntent({ messageText: phrase, userId: "u1" });
      assert.equal(decision.shouldQuery, true, `"${phrase}" must retrieve memory`);
      assert.equal(decision.reasonCode, MemoryGateReason.EXPLICIT_RECALL);
    });
  }
});

test("softer recall phrasing is caught by the legacy heuristic in OFF mode", async (t) => {
  for (const phrase of LEGACY_ONLY_PHRASES) {
    await t.test(phrase, async () => {
      const decision = await mediateMemoryIntent({ messageText: phrase, userId: "u1" });
      assert.equal(decision.shouldQuery, true, `"${phrase}" must retrieve memory`);
      assert.equal(decision.reasonCode, MemoryGateReason.LEGACY_HEURISTIC);
    });
  }
});

test("generic questions still skip memory retrieval in OFF mode", async (t) => {
  for (const phrase of NON_RECALL_PHRASES) {
    await t.test(phrase, async () => {
      const decision = await mediateMemoryIntent({ messageText: phrase, userId: "u1" });
      assert.equal(decision.shouldQuery, false, `"${phrase}" must not retrieve memory`);
    });
  }
});

test("isExplicitMemoryRecall agrees on every phrase class", () => {
  for (const phrase of EXPLICIT_PHRASES) {
    assert.equal(isExplicitMemoryRecall(phrase), true, phrase);
  }
  assert.equal(isExplicitMemoryRecall("what is the capital of France?"), false);
});
