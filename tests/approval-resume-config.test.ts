import test from "node:test";
import assert from "node:assert/strict";

import { resolveResumeConfig } from "@/lib/orchestrator/resumeConfig";

test("persisted interrupt config wins over picker values", () => {
  const result = resolveResumeConfig("gpt-5.6-sol", "low", [
    { type: "human_in_the_loop", model: "gpt-5.5-pro", reasoningEffort: "xhigh" },
  ]);
  assert.equal(result.model, "gpt-5.5-pro");
  assert.equal(result.reasoningEffort, "xhigh");
  assert.equal(result.usedPersisted, true);
});

test("persisted config equal to picker still counts as persisted (no rebuild needed upstream)", () => {
  const result = resolveResumeConfig("gpt-5.6-sol", "high", [
    { model: "gpt-5.6-sol", reasoningEffort: "high" },
  ]);
  assert.equal(result.model, "gpt-5.6-sol");
  assert.equal(result.reasoningEffort, "high");
  assert.equal(result.usedPersisted, true);
});

test("legacy interrupt payload without model falls back to picker values", () => {
  const result = resolveResumeConfig("gpt-5.6-terra", "medium", [
    { type: "human_in_the_loop", requestKind: "ask_user", question: "?" },
  ]);
  assert.equal(result.model, "gpt-5.6-terra");
  assert.equal(result.reasoningEffort, "medium");
  assert.equal(result.usedPersisted, false);
});

test("unknown persisted model id is rejected, picker values kept", () => {
  const result = resolveResumeConfig("gpt-5.6-sol", "low", [
    { model: "gpt-99-ultra", reasoningEffort: "high" },
  ]);
  assert.equal(result.model, "gpt-5.6-sol");
  assert.equal(result.reasoningEffort, "low");
  assert.equal(result.usedPersisted, false);
});

test("persisted null effort (model without effort at creation) resolves to null, not picker effort", () => {
  const result = resolveResumeConfig("gpt-5.6-sol", "high", [
    { model: "gpt-5.6-sol", reasoningEffort: null },
  ]);
  assert.equal(result.model, "gpt-5.6-sol");
  assert.equal(result.reasoningEffort, null);
  assert.equal(result.usedPersisted, true);
});

test("garbage persisted effort string parses to null", () => {
  const result = resolveResumeConfig("gpt-5.6-sol", "low", [
    { model: "gpt-5.6-sol", reasoningEffort: "ultra-max-turbo" },
  ]);
  assert.equal(result.reasoningEffort, null);
  assert.equal(result.usedPersisted, true);
});

test("empty interrupt list falls back to picker values", () => {
  const result = resolveResumeConfig("gpt-5.5", "medium", []);
  assert.equal(result.model, "gpt-5.5");
  assert.equal(result.reasoningEffort, "medium");
  assert.equal(result.usedPersisted, false);
});

test("non-record interrupt values are ignored", () => {
  const result = resolveResumeConfig("gpt-5.5", "low", ["approved", null, undefined, 42]);
  assert.equal(result.model, "gpt-5.5");
  assert.equal(result.usedPersisted, false);
});
