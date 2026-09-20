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
   * effort is not in this model's supported set.
   */
  defaultReasoningEffort: ReasoningEffortLevel;
  recommended?: boolean;
  /**
   * USD per 1M tokens. Source: https://platform.openai.com/docs/pricing
   * Used to compute relative cost multipliers in the model selector.
   */
  pricing?: { input: number; output: number };
}

/**
 * Models available as of 2026-09-03 — latest two OpenAI generations only.
 * Older families are deprecated or superseded:
 * https://platform.openai.com/docs/deprecations
 */
export const OPENAI_MODELS: OpenAIModel[] = [
  {
    id: "gpt-5.6-sol",
    name: "GPT-5.6 Sol",
    description:
      "Flagship GPT-5.6 model for complex reasoning, coding, and professional tasks",
    contextWindow: 1050000,
    category: "reasoning",
    capabilities: ["text", "vision"],
    hasReasoning: true,
    recommended: true,
    supportedReasoningEfforts: REASONING_EFFORTS,
    defaultReasoningEffort: "medium",
    pricing: { input: 4.0, output: 20.0 },
  },
  {
    id: "gpt-5.6-terra",
    name: "GPT-5.6 Terra",
    description:
      "GPT-5.6 model that balances intelligence and cost for everyday workloads",
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
    description:
      "Cost-optimised GPT-5.6 model for high-volume, latency-sensitive workloads",
    contextWindow: 1050000,
    category: "reasoning",
    capabilities: ["text", "vision"],
    hasReasoning: true,
    supportedReasoningEfforts: REASONING_EFFORTS,
    defaultReasoningEffort: "medium",
    pricing: { input: 0.2, output: 1.2 },
  },
  {
    id: "gpt-5.5",
    name: "GPT-5.5",
    description:
      "Previous-generation flagship for coding and professional work",
    contextWindow: 1050000,
    category: "reasoning",
    capabilities: ["text", "vision"],
    hasReasoning: true,
    supportedReasoningEfforts: ["none", "low", "medium", "high", "xhigh"] as const,
    defaultReasoningEffort: "medium",
    pricing: { input: 5.0, output: 30.0 },
  },
  {
    id: "gpt-5.5-pro",
    name: "GPT-5.5 Pro",
    description:
      "Higher-compute GPT-5.5 for the hardest problems (slower, more precise)",
    contextWindow: 1050000,
    category: "reasoning",
    capabilities: ["text", "vision"],
    hasReasoning: true,
    supportedReasoningEfforts: ["medium", "high", "xhigh"] as const,
    defaultReasoningEffort: "high",
    pricing: { input: 30.0, output: 180.0 },
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

/**
 * Formats a multiplier for display: "1x", "2.2x", "25x".
 */
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

/** Whether a model accepts the given reasoning effort level. */
export function isReasoningEffortSupported(
  modelId: string,
  effort: ReasoningEffortLevel
): boolean {
  const model = getModelById(modelId);
  return model ? model.supportedReasoningEfforts.includes(effort) : false;
}

/** Effort levels to offer for a model in the composer. */
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
