import test from "node:test";
import assert from "node:assert/strict";

import {
  REASONING_EFFORTS,
  OPENAI_MODELS,
  DEFAULT_MODEL,
  getModelById,
  isReasoningEffortSupported,
  getSupportedReasoningEfforts,
  getDefaultReasoningEffort,
  DEFAULT_REASONING_EFFORT,
} from "@/constants/openai-models";
import {
  parseReasoningEffortParam,
  validateRequestedModel,
  getChatReasoningEffort,
  getSupportedTemperature,
  requiresResponsesApiForToolCalling,
} from "@/lib/modelPolicy";

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
  assert.deepEqual(
    getSupportedReasoningEfforts("gpt-6-astra"),
    ["low", "medium", "high", "xhigh", "max"],
  );
  assert.deepEqual(getSupportedReasoningEfforts("gpt-6-sol"), REASONING_EFFORTS);
  assert.deepEqual(getSupportedReasoningEfforts("gpt-6-luna"), REASONING_EFFORTS);
  assert.deepEqual(getSupportedReasoningEfforts("gpt-5.6-sol"), REASONING_EFFORTS);
  assert.deepEqual(getSupportedReasoningEfforts("gpt-5.6-terra"), REASONING_EFFORTS);
  assert.deepEqual(getSupportedReasoningEfforts("gpt-5.6-luna"), REASONING_EFFORTS);
});

test("support checks honor per-model boundaries", () => {
  assert.equal(isReasoningEffortSupported("gpt-6-sol", "max"), true);
  assert.equal(isReasoningEffortSupported("gpt-6-luna", "none"), true);
  assert.equal(isReasoningEffortSupported("gpt-6-astra", "low"), true);
  assert.equal(isReasoningEffortSupported("gpt-6-astra", "none"), false);
  assert.equal(isReasoningEffortSupported("gpt-5.6-terra", "max"), true);
  assert.equal(isReasoningEffortSupported("nonexistent-model", "high"), false);
});

test("default resolution: app default where supported, otherwise the model's own default", () => {
  assert.equal(getDefaultReasoningEffort("gpt-6-sol"), DEFAULT_REASONING_EFFORT);
  assert.equal(getDefaultReasoningEffort("gpt-6-astra"), "medium");
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
  assert.equal(validateRequestedModel("gpt-6-sol"), "gpt-6-sol");
  assert.equal(validateRequestedModel("gpt-6-astra"), "gpt-6-astra");
  assert.equal(validateRequestedModel("gpt-5.6-terra"), "gpt-5.6-terra");
  assert.equal(validateRequestedModel("gpt-4o"), null);
  assert.equal(validateRequestedModel(""), null);
});

test("retired gpt-5.5 ids are no longer part of the catalog", () => {
  assert.equal(validateRequestedModel("gpt-5.5"), null);
  assert.equal(validateRequestedModel("gpt-5.5-pro"), null);
  assert.equal(validateRequestedModel("gpt-5.5-2026-04-23"), null);
});

test("getChatReasoningEffort: explicit supported effort wins, unsupported falls back to model default", () => {
  assert.equal(getChatReasoningEffort("gpt-6-sol", "max"), "max");
  assert.equal(getChatReasoningEffort("gpt-6-astra", "xhigh"), "xhigh");
  assert.equal(getChatReasoningEffort("gpt-6-astra", "none"), "medium");
  assert.equal(getChatReasoningEffort("gpt-6-luna", undefined), getDefaultReasoningEffort("gpt-6-luna"));
  assert.equal(getChatReasoningEffort("gpt-5.6-sol", "high"), "high");
});

test("getChatReasoningEffort keeps the legacy base-series and non-reasoning contracts", () => {
  // The base GPT-5.0 series predates "none" and answers via "minimal".
  assert.equal(getChatReasoningEffort("gpt-5", "none"), "minimal");
  // Point releases from GPT-5.1 onwards accept "none" directly.
  assert.equal(getChatReasoningEffort("gpt-5.1", "none"), "none");
  // Non-reasoning families must not receive a reasoning parameter at all.
  assert.equal(getChatReasoningEffort("gpt-4.1", "high"), undefined);
  assert.equal(getChatReasoningEffort("gpt-4o", "low"), undefined);
  assert.equal(getChatReasoningEffort("o3", "high"), undefined);
});

test("custom temperature is dropped across the whole reasoning series", () => {
  assert.equal(getSupportedTemperature("gpt-6-astra", 0.2), undefined);
  assert.equal(getSupportedTemperature("gpt-6-sol", 0.2), undefined);
  assert.equal(getSupportedTemperature("gpt-5.6-terra", 0.2), undefined);
  assert.equal(getSupportedTemperature("gpt-6-luna", undefined), undefined);
  assert.equal(getSupportedTemperature("gpt-4o", 0.2), 0.2);
  assert.equal(getSupportedTemperature("gpt-4.1", 0), 0);
});

test("GPT-6 tool calling is routed through the Responses API", () => {
  assert.equal(requiresResponsesApiForToolCalling("gpt-6-astra"), true);
  assert.equal(requiresResponsesApiForToolCalling("gpt-6-sol"), true);
  assert.equal(requiresResponsesApiForToolCalling("gpt-6-luna"), true);
  assert.equal(requiresResponsesApiForToolCalling("gpt-5.6-sol"), false);
  assert.equal(requiresResponsesApiForToolCalling("gpt-4o"), false);
});

test("model catalog ids are unique", () => {
  const ids = OPENAI_MODELS.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(getModelById("gpt-6-sol"));
  assert.equal(DEFAULT_MODEL, "gpt-6-sol");
});
