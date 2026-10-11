import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_MODEL,
  DEFAULT_REASONING_EFFORT,
  OPENAI_MODELS,
  REASONING_EFFORTS,
  getDefaultReasoningEffort,
  getModelById,
  getModelCostMultiplier,
  getSupportedReasoningEfforts,
  isReasoningEffortSupported,
} from "@/constants/openai-models";
import {
  getChatReasoningEffort,
  getSupportedTemperature,
  parseReasoningEffortParam,
  requiresResponsesApiForToolCalling,
  validateRequestedModel,
} from "@/lib/modelPolicy";
import {
  getModel,
  getReasoningEffort,
  getReasoningEffortMap,
  saveModel,
  setReasoningEffortForModel,
} from "@/lib/storage";
import { resolveResumeConfig } from "@/lib/orchestrator/resumeConfig";
import { calculateTokenUsage } from "@/lib/utils/tokenCounter";
import { estimateImageTokensForModel } from "@/lib/utils/imageTokenCost";

function withStorage(run: (values: Map<string, string>) => void) {
  const values = new Map<string, string>();
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
      removeItem: (key: string) => {
        values.delete(key);
      },
    },
  });
  try {
    run(values);
  } finally {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
}

test("catalog identities, defaults, and prices are coherent", () => {
  const ids = OPENAI_MODELS.map(({ id }) => id);
  assert.ok(ids.length > 0);
  assert.equal(new Set(ids).size, ids.length);
  const recommended = OPENAI_MODELS.filter((model) => model.recommended);
  assert.equal(recommended.length, 1);
  assert.equal(DEFAULT_MODEL, recommended[0].id);
  for (const model of OPENAI_MODELS) {
    assert.equal(model.id, model.id.trim());
    assert.ok(model.name.trim());
    assert.ok(model.description.trim());
    assert.ok(Number.isSafeInteger(model.contextWindow) && model.contextWindow > 0);
    assert.ok(model.capabilities.includes("text"));
    assert.equal(getModelById(model.id), model);
    assert.equal(validateRequestedModel(model.id), model.id);
    if (model.pricing) {
      assert.ok(Number.isFinite(model.pricing.input) && model.pricing.input > 0);
      assert.ok(Number.isFinite(model.pricing.output) && model.pricing.output > 0);
      assert.ok(getModelCostMultiplier(model)! >= 1);
    }
  }
});

// Every catalog addition runs the same contract; no model-specific fixtures.
for (const model of OPENAI_MODELS) {
  const supported = model.supportedReasoningEfforts;
  const expectedDefault = supported.includes(DEFAULT_REASONING_EFFORT)
    ? DEFAULT_REASONING_EFFORT
    : model.defaultReasoningEffort;

  test(`${model.id}: reasoning choices agree across composer and backend`, () => {
    assert.ok(supported.length > 0);
    assert.equal(new Set(supported).size, supported.length);
    assert.deepEqual(supported, REASONING_EFFORTS.filter((effort) => supported.includes(effort)));
    assert.ok(supported.includes(model.defaultReasoningEffort));
    assert.deepEqual(getSupportedReasoningEfforts(model.id), supported);
    assert.equal(getDefaultReasoningEffort(model.id), expectedDefault);
    assert.equal(getChatReasoningEffort(model.id), expectedDefault);
    assert.equal(getChatReasoningEffort(model.id, null), expectedDefault);
    for (const effort of REASONING_EFFORTS) {
      assert.equal(isReasoningEffortSupported(model.id, effort), supported.includes(effort));
      assert.equal(getChatReasoningEffort(model.id, effort), supported.includes(effort) ? effort : expectedDefault);
    }
    for (const temperature of [undefined, 0, 0.2, 1]) {
      assert.equal(getSupportedTemperature(model.id, temperature), undefined);
    }
    const majorVersion = Number(model.id.match(/^gpt-(\d+)/)?.[1]);
    assert.ok(Number.isInteger(majorVersion) && majorVersion >= 5);
    assert.equal(requiresResponsesApiForToolCalling(model.id), majorVersion >= 6);
  });

  test(`${model.id}: saved selection and effort survive reload and invalid stored values`, () => {
    withStorage((values) => {
      assert.equal(saveModel(model.id), true);
      assert.equal(getModel(), model.id);
      assert.equal(getReasoningEffort(), expectedDefault);
      for (const effort of REASONING_EFFORTS) {
        const before = getReasoningEffort();
        assert.equal(setReasoningEffortForModel(model.id, effort), supported.includes(effort));
        assert.equal(getReasoningEffort(), supported.includes(effort) ? effort : before);
        values.set("agentic-chat-reasoning-effort", JSON.stringify({ [model.id]: effort }));
        assert.equal(getReasoningEffortMap()[model.id], supported.includes(effort) ? effort : undefined);
        assert.equal(getReasoningEffort(), supported.includes(effort) ? effort : expectedDefault);
      }
      for (const invalid of ["not-json", "null", "[]", "42", JSON.stringify({ [model.id]: "invalid" })]) {
        values.set("agentic-chat-reasoning-effort", invalid);
        assert.equal(getReasoningEffort(), expectedDefault);
      }
      for (const legacyEffort of ["none", "high"] as const) {
        values.set("agentic-chat-reasoning-effort", legacyEffort);
        assert.equal(getReasoningEffort(), supported.includes(legacyEffort) ? legacyEffort : expectedDefault);
      }
    });
  });

  test(`${model.id}: approval resumes preserve the persisted model and effort`, () => {
    const otherModel = OPENAI_MODELS.find(({ id }) => id !== model.id)?.id ?? model.id;
    for (const effort of [...supported, null]) {
      assert.deepEqual(
        resolveResumeConfig(otherModel, "low", [{ model: model.id, reasoningEffort: effort }]),
        { model: model.id, reasoningEffort: effort, usedPersisted: true },
      );
    }
  });

  test(`${model.id}: text and image budgets use the catalog context window`, () => {
    const textUsage = calculateTokenUsage([{ role: "user", content: "Describe this image." }], model.id);
    const imageUsage = calculateTokenUsage([{
      role: "user",
      content: [
        { type: "text", text: "Describe this image." },
        { type: "image_url", image_url: { url: "https://example.com/image.png" } },
      ],
    }], model.id);
    assert.equal(textUsage.limit, model.contextWindow);
    assert.equal(imageUsage.limit, model.contextWindow);
    assert.ok(textUsage.used > 0);
    assert.ok(textUsage.responseReserve > 0 && textUsage.responseReserve < textUsage.limit);
    assert.equal(imageUsage.used - textUsage.used, estimateImageTokensForModel(model.id));
    assert.equal(imageUsage.breakdown.images, imageUsage.used - textUsage.used);
    assert.equal(imageUsage.remaining, imageUsage.limit - imageUsage.used - imageUsage.responseReserve);
    assert.ok(imageUsage.percentage > textUsage.percentage);

    const emptyUsage = calculateTokenUsage([], model.id);
    assert.equal(emptyUsage.breakdown.images, 0);
    assert.equal(emptyUsage.limit, model.contextWindow);
    assert.ok(emptyUsage.remaining > 0);

    const imageTokens = estimateImageTokensForModel(model.id);
    assert.ok(Number.isFinite(imageTokens) && imageTokens > 0);
    const overflowUsage = calculateTokenUsage([{
      role: "user",
      content: Array.from({ length: Math.ceil(model.contextWindow / imageTokens) + 1 }, () => ({
        type: "image_url" as const,
        image_url: { url: "https://example.com/image.png" },
      })),
    }], model.id);
    assert.ok(overflowUsage.used > model.contextWindow);
    assert.equal(overflowUsage.remaining, 0);
    assert.equal(overflowUsage.percentage, 100);
  });
}

test("reasoning parser rejects malformed input and accepts exactly the public enum", () => {
  for (const effort of REASONING_EFFORTS) assert.equal(parseReasoningEffortParam(effort), effort);
  for (const value of ["MAX", "minimal", "", null, undefined, 5, {}, []]) {
    assert.equal(parseReasoningEffortParam(value), null);
  }
});

test("unknown and excluded models are rejected by the backend and saved preferences", () => {
  assert.equal(getDefaultReasoningEffort("unknown-model"), DEFAULT_REASONING_EFFORT);
  for (const id of ["unknown-model", "", "gpt-4o", "gpt-5.5", "gpt-5.5-pro", "gpt-5.5-2026-04-23"]) {
    assert.equal(validateRequestedModel(id), null);
    assert.equal(getModelById(id), undefined);
    assert.equal(isReasoningEffortSupported(id, "high"), false);
  }
  withStorage((values) => {
    values.set("openai_model", "unknown-model");
    assert.equal(getModel(), DEFAULT_MODEL);
    assert.equal(setReasoningEffortForModel("unknown-model", "high"), false);
  });
});

test("switching models preserves each model's independent effort preference", () => {
  withStorage(() => {
    for (const model of OPENAI_MODELS) {
      const effort = model.supportedReasoningEfforts.at(-1)!;
      assert.equal(setReasoningEffortForModel(model.id, effort), true);
    }
    for (const model of OPENAI_MODELS) {
      assert.equal(saveModel(model.id), true);
      assert.equal(getReasoningEffort(), model.supportedReasoningEfforts.at(-1));
      assert.equal(setReasoningEffortForModel(model.id, model.supportedReasoningEfforts[0]), true);
    }
    for (const model of OPENAI_MODELS) {
      assert.equal(saveModel(model.id), true);
      assert.equal(getReasoningEffort(), model.supportedReasoningEfforts[0]);
    }
  });
});

test("unavailable browser storage returns safe defaults", () => {
  withStorage(() => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() { throw new Error("Storage access denied"); },
    });
    assert.equal(getModel(), null);
    assert.deepEqual(getReasoningEffortMap(), {});
    assert.equal(getReasoningEffort(), getDefaultReasoningEffort(DEFAULT_MODEL));
    for (const model of OPENAI_MODELS) {
      assert.equal(saveModel(model.id), false);
      assert.equal(setReasoningEffortForModel(model.id, model.defaultReasoningEffort), false);
    }
  });
});

test("legacy reasoning and non-reasoning API contracts remain supported", () => {
  assert.equal(getChatReasoningEffort("gpt-5", "none"), "minimal");
  assert.equal(getChatReasoningEffort("gpt-5.1", "none"), "none");
  for (const id of ["gpt-4.1", "gpt-4o", "o3"]) {
    assert.equal(getChatReasoningEffort(id, "high"), undefined);
    assert.equal(getSupportedTemperature(id, 0.2), 0.2);
    assert.equal(requiresResponsesApiForToolCalling(id), false);
  }
});
