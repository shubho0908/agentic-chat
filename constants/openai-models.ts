import { z } from "zod";

/**
 * Reasoning effort levels offered in the composer. The enum mirrors OpenAI's
 * reasoning effort values; each model offers only the subset it actually
 * supports (see OpenAIModel.supportedReasoningEfforts, sourced from
 * https://developers.openai.com/api/docs/models). "none" answers directly
 * without a reasoning pass; the rest map 1:1 onto OpenAI reasoning effort.
 */
export const REASONING_EFFORTS = [
  "none",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;

export const reasoningEffortSchema = z.enum(REASONING_EFFORTS);

export type ReasoningEffortLevel = (typeof REASONING_EFFORTS)[number];

export const DEFAULT_REASONING_EFFORT: ReasoningEffortLevel = "none";

export const REASONING_EFFORT_META: Record<
  ReasoningEffortLevel,
  { label: string; description: string }
> = {
  none: {
    label: "None",
    description: "Responds directly without reasoning. Fastest.",
  },
  low: {
    label: "Low",
    description: "Light reasoning for simple questions.",
  },
  medium: {
    label: "Medium",
    description: "Balanced reasoning for most tasks.",
  },
  high: {
    label: "High",
    description: "Deep reasoning for the hardest problems.",
  },
  xhigh: {
    label: "Extra High",
    description: "Extended reasoning for deep research and long agentic runs.",
  },
  max: {
    label: "Max",
    description: "Maximum reasoning for the most complex tasks.",
  },
};

export function isReasoningEffortLevel(
  value: unknown
): value is ReasoningEffortLevel {
  return (
    typeof value === "string" &&
    (REASONING_EFFORTS as readonly string[]).includes(value)
  );
}

interface OpenAIModel {
  id: string;
  name: string;
  description: string;
  contextWindow: number;
  category: "reasoning" | "chat" | "legacy";
  capabilities: ("text" | "vision" | "audio" | "video")[];
  hasReasoning?: boolean;
  /**
   * Effort levels this model accepts, per the OpenAI model docs
   * (https://developers.openai.com/api/docs/models/<id>). Values outside this
   * set are rejected by the API with HTTP 400.
   */
  supportedReasoningEfforts: readonly ReasoningEffortLevel[];
  /**
   * OpenAI's own default effort for this model; used when the app default
   * effort is not in this model's supported set (e.g. gpt-6-astra does not
   * accept "none").
   */
  defaultReasoningEffort: ReasoningEffortLevel;
  recommended?: boolean;
  /**
   * USD per 1M tokens. Source: https://developers.openai.com/api/docs/pricing
   * Used to compute relative cost multipliers in the model selector.
   */
  pricing?: { input: number; output: number };
}

/**
 * Effort levels for models that always run a reasoning pass: GPT-6 Astra
 * rejects "none" and starts at "low".
 * Source: https://developers.openai.com/api/docs/models/gpt-6-astra
 */
const EFFORTS_WITHOUT_NONE: readonly ReasoningEffortLevel[] = [
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
];

/**
 * Models available as of 2026-09-23 — the latest two OpenAI generations: the
 * GPT-6 family (Astra, Sol, Luna) and the GPT-5.6 family it supersedes. GPT-5.5
 * and older are excluded: OpenAI's model selection guidance now starts at GPT-6
 * (https://developers.openai.com/api/docs/models) and GPT-5.5 was retired from
 * ChatGPT, ChatGPT Work, and Codex on 2026-10-14
 * (https://help.openai.com/en/articles/6825453-chatgpt-release-notes).
 *
 * Per-model sources: https://developers.openai.com/api/docs/models/gpt-6-astra,
 * .../gpt-6-sol, .../gpt-6-luna, .../gpt-5.6-sol, .../gpt-5.6-terra,
 * .../gpt-5.6-luna; migration guide:
 * https://developers.openai.com/api/docs/guides/latest-model. Deprecation
 * schedule: https://developers.openai.com/api/docs/deprecations
 */
export const OPENAI_MODELS: OpenAIModel[] = [
  {
    id: "gpt-6-astra",
    name: "GPT-6 Astra",
    description: "Our most capable model, built for the hardest end-to-end work",
    contextWindow: 1050000,
    category: "reasoning",
    capabilities: ["text", "vision"],
    hasReasoning: true,
    supportedReasoningEfforts: EFFORTS_WITHOUT_NONE,
    defaultReasoningEffort: "medium",
    pricing: { input: 10.0, output: 50.0 },
  },
  {
    id: "gpt-6-sol",
    name: "GPT-6 Sol",
    description: "Built to power complex coding and agentic workflows",
    contextWindow: 1050000,
    category: "reasoning",
    capabilities: ["text", "vision"],
    hasReasoning: true,
    recommended: true,
    supportedReasoningEfforts: REASONING_EFFORTS,
    defaultReasoningEffort: "medium",
    pricing: { input: 2.0, output: 10.0 },
  },
  {
    id: "gpt-6-luna",
    name: "GPT-6 Luna",
    description: "Our most efficient model for focused, high-volume tasks",
    contextWindow: 1050000,
    category: "reasoning",
    capabilities: ["text", "vision"],
    hasReasoning: true,
    supportedReasoningEfforts: REASONING_EFFORTS,
    defaultReasoningEffort: "medium",
    pricing: { input: 0.1, output: 0.5 },
  },
  {
    id: "gpt-5.6-sol",
    name: "GPT-5.6 Sol",
    description: "Flagship model for complex professional work",
    contextWindow: 1050000,
    category: "reasoning",
    capabilities: ["text", "vision"],
    hasReasoning: true,
    supportedReasoningEfforts: REASONING_EFFORTS,
    defaultReasoningEffort: "medium",
    pricing: { input: 4.0, output: 20.0 },
  },
  {
    id: "gpt-5.6-terra",
    name: "GPT-5.6 Terra",
    description: "GPT-5.6 model that balances intelligence and cost",
    contextWindow: 1050000,
    category: "reasoning",
    capabilities: ["text", "vision"],
    hasReasoning: true,
    supportedReasoningEfforts: REASONING_EFFORTS,
    defaultReasoningEffort: "medium",
    pricing: { input: 2.0, output: 12.0 },
  },
  {
    id: "gpt-5.6-luna",
    name: "GPT-5.6 Luna",
    description: "GPT-5.6 model optimized for cost-sensitive workloads",
    contextWindow: 1050000,
    category: "reasoning",
    capabilities: ["text", "vision"],
    hasReasoning: true,
    supportedReasoningEfforts: REASONING_EFFORTS,
    defaultReasoningEffort: "medium",
    pricing: { input: 0.2, output: 1.2 },
  },
];

export const DEFAULT_MODEL = OPENAI_MODELS.find((m) => m.recommended)?.id ?? OPENAI_MODELS[0].id;

/**
 * Blended cost per 1M tokens, weighted to reflect typical chat usage
 * (roughly 1 input token per 4 output tokens).
 */
function getBlendedCost(model: OpenAIModel): number | null {
  if (!model.pricing) return null;
  return model.pricing.input * 0.2 + model.pricing.output * 0.8;
}

const CHEAPEST_BLENDED_COST = (() => {
  const costs = OPENAI_MODELS.map(getBlendedCost).filter(
    (cost): cost is number => cost !== null && cost > 0
  );
  return costs.length > 0 ? Math.min(...costs) : null;
})();

/**
 * Returns a cost multiplier relative to the cheapest priced model (= 1x),
 * or null if pricing data is unavailable.
 */
export function getModelCostMultiplier(model: OpenAIModel): number | null {
  const blended = getBlendedCost(model);
  if (blended === null || CHEAPEST_BLENDED_COST === null) return null;
  return blended / CHEAPEST_BLENDED_COST;
}

export function formatCostMultiplier(multiplier: number): string {
  if (multiplier >= 10) return `${Math.round(multiplier)}x`;
  if (multiplier >= 1.05) return `${multiplier.toFixed(1)}x`;
  return "1x";
}

const OPENAI_MODELS_BY_ID = new Map(
  OPENAI_MODELS.map((model) => [model.id, model])
);

export function getModelById(modelId: string): OpenAIModel | undefined {
  return OPENAI_MODELS_BY_ID.get(modelId);
}

export function isReasoningEffortSupported(
  modelId: string,
  effort: ReasoningEffortLevel
): boolean {
  const model = getModelById(modelId);
  return model ? model.supportedReasoningEfforts.includes(effort) : false;
}

export function getSupportedReasoningEfforts(
  modelId: string
): readonly ReasoningEffortLevel[] {
  return getModelById(modelId)?.supportedReasoningEfforts ?? REASONING_EFFORTS;
}

/**
 * Effort applied when the user has not chosen one for this model: the app
 * default where the model supports it, otherwise the model's own default
 * (e.g. gpt-5.5-pro does not accept "none").
 */
export function getDefaultReasoningEffort(
  modelId: string
): ReasoningEffortLevel {
  const model = getModelById(modelId);
  if (!model) return DEFAULT_REASONING_EFFORT;
  return model.supportedReasoningEfforts.includes(DEFAULT_REASONING_EFFORT)
    ? DEFAULT_REASONING_EFFORT
    : model.defaultReasoningEffort;
}
