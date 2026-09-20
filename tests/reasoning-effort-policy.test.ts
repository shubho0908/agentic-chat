import test from "node:test";
import assert from "node:assert/strict";

import {
  REASONING_EFFORTS,
  OPENAI_MODELS,
  getModelById,
  isReasoningEffortSupported,
  getSupportedReasoningEfforts,
  getDefaultReasoningEffort,
  DEFAULT_REASONING_EFFORT,
} from "@/constants/openai-models";
import { parseReasoningEffortParam, validateRequestedModel, getChatReasoningEffort } from "@/lib/modelPolicy";

test("every model declares its supported efforts as a subset of the enum, containing its default", () => {
  for (const model of OPENAI_MODELS) {
    for (const effort of model.supportedReasoningEfforts) {
      assert.ok(
        (REASONING_EFFORTS as readonly string[]).includes(effort),
        `${model.id} declares unknown effort ${effort}`,
      );
    }
    assert.ok(
      model.supportedReasoningEfforts.includes(model.defaultReasoningEffort),
      `${model.id} default ${model.defaultReasoningEffort} not in its supported list`,
    );
  }
});

test("per-model ranges match the advertised contract", () => {
  assert.deepEqual(getSupportedReasoningEfforts("gpt-5.6-sol"), REASONING_EFFORTS);
  assert.deepEqual(getSupportedReasoningEfforts("gpt-5.6-terra"), REASONING_EFFORTS);
  assert.deepEqual(getSupportedReasoningEfforts("gpt-5.6-luna"), REASONING_EFFORTS);
  assert.deepEqual(getSupportedReasoningEfforts("gpt-5.5"), ["none", "low", "medium", "high", "xhigh"]);
  assert.deepEqual(getSupportedReasoningEfforts("gpt-5.5-pro"), ["medium", "high", "xhigh"]);
});

test("support checks honor per-model boundaries", () => {
  assert.equal(isReasoningEffortSupported("gpt-5.6-sol", "max"), true);
  assert.equal(isReasoningEffortSupported("gpt-5.5", "max"), false);
  assert.equal(isReasoningEffortSupported("gpt-5.5-pro", "none"), false);
  assert.equal(isReasoningEffortSupported("gpt-5.5-pro", "low"), false);
  assert.equal(isReasoningEffortSupported("gpt-5.5-pro", "high"), true);
  assert.equal(isReasoningEffortSupported("nonexistent-model", "high"), false);
});

test("default resolution: app default where supported, otherwise the model's own default", () => {
  assert.equal(getDefaultReasoningEffort("gpt-5.6-sol"), DEFAULT_REASONING_EFFORT);
  assert.equal(getDefaultReasoningEffort("gpt-5.5-pro"), "high");
  assert.equal(getDefaultReasoningEffort("unknown-model"), DEFAULT_REASONING_EFFORT);
});

test("parseReasoningEffortParam accepts exactly the enum and rejects everything else", () => {
  for (const effort of REASONING_EFFORTS) {
    assert.equal(parseReasoningEffortParam(effort), effort);
  }
  assert.equal(parseReasoningEffortParam("MAX"), null);
  assert.equal(parseReasoningEffortParam(""), null);
  assert.equal(parseReasoningEffortParam(null), null);
  assert.equal(parseReasoningEffortParam(undefined), null);
  assert.equal(parseReasoningEffortParam(5), null);
});

test("validateRequestedModel accepts only catalog models", () => {
  assert.equal(validateRequestedModel("gpt-5.6-sol"), "gpt-5.6-sol");
  assert.equal(validateRequestedModel("gpt-4o"), null);
  assert.equal(validateRequestedModel(""), null);
});

test("getChatReasoningEffort: explicit supported effort wins, unsupported falls back to model default", () => {
  assert.equal(getChatReasoningEffort("gpt-5.6-sol", "max"), "max");
  assert.equal(getChatReasoningEffort("gpt-5.5-pro", "none"), "high");
  assert.equal(getChatReasoningEffort("gpt-5.5", "max"), getDefaultReasoningEffort("gpt-5.5"));
  assert.equal(getChatReasoningEffort("gpt-5.6-sol", undefined), getDefaultReasoningEffort("gpt-5.6-sol"));
});

test("model catalog ids are unique", () => {
  const ids = OPENAI_MODELS.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(getModelById("gpt-5.6-sol"));
});
