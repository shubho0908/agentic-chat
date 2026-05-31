interface OpenAIModel {
  id: string;
  name: string;
  description: string;
  contextWindow: number;
  category: "reasoning" | "chat" | "legacy";
  capabilities: ("text" | "vision" | "audio" | "video")[];
  hasReasoning?: boolean;
  recommended?: boolean;
  /**
   * USD per 1M tokens. Source: https://platform.openai.com/docs/pricing
   * Used to compute relative cost multipliers in the model selector.
   */
  pricing?: { input: number; output: number };
}

export const OPENAI_MODELS: OpenAIModel[] = [
  {
    id: "gpt-5.5",
    name: "GPT-5.5",
    description:
      "Most capable model for complex reasoning, coding, and professional tasks",
    contextWindow: 1050000,
    category: "reasoning",
    capabilities: ["text", "vision"],
    hasReasoning: true,
    recommended: true,
    pricing: { input: 5.0, output: 30.0 },
  },
  {
    id: "gpt-5.4",
    name: "GPT-5.4",
    description:
      "Best intelligence at scale for agentic, coding, and professional workflows",
    contextWindow: 1050000,
    category: "reasoning",
    capabilities: ["text", "vision"],
    hasReasoning: true,
    pricing: { input: 2.5, output: 15.0 },
  },
  {
    id: "gpt-5.4-mini",
    name: "GPT-5.4 Mini",
    description:
      "Strongest mini model for coding, computer use, and subagents at lower cost",
    contextWindow: 400000,
    category: "reasoning",
    capabilities: ["text", "vision"],
    hasReasoning: true,
    pricing: { input: 0.75, output: 4.5 },
  },
  {
    id: "gpt-5.4-nano",
    name: "GPT-5.4 Nano",
    description: "Fastest, cheapest GPT-5.4 model for simple high-volume tasks",
    contextWindow: 400000,
    category: "reasoning",
    capabilities: ["text", "vision"],
    hasReasoning: true,
    pricing: { input: 0.2, output: 1.25 },
  },

  {
    id: "gpt-5.2",
    name: "GPT-5.2",
    description: "Previous frontier GPT-5 model for complex professional work",
    contextWindow: 400000,
    category: "reasoning",
    capabilities: ["text", "vision"],
    hasReasoning: true,
    pricing: { input: 2.5, output: 15.0 },
  },
  {
    id: "gpt-5.2-codex",
    name: "GPT-5.2 Codex",
    description:
      "Specialized GPT-5 model for long-horizon, agentic coding tasks",
    contextWindow: 400000,
    category: "reasoning",
    capabilities: ["text", "vision"],
    hasReasoning: true,
    pricing: { input: 1.75, output: 14.0 },
  },

  {
    id: "gpt-5",
    name: "GPT-5",
    description: "Previous GPT-5 reasoning model for coding and agentic tasks",
    contextWindow: 400000,
    category: "legacy",
    capabilities: ["text", "vision"],
    hasReasoning: true,
    pricing: { input: 1.25, output: 10.0 },
  },
  {
    id: "gpt-5-mini",
    name: "GPT-5 Mini",
    description: "Near-frontier GPT-5 model for lower latency and cost",
    contextWindow: 400000,
    category: "legacy",
    capabilities: ["text", "vision"],
    hasReasoning: true,
    pricing: { input: 0.25, output: 2.0 },
  },
  {
    id: "gpt-5-nano",
    name: "GPT-5 Nano",
    description:
      "Fastest, cheapest GPT-5 model for classification and summarization",
    contextWindow: 400000,
    category: "legacy",
    capabilities: ["text", "vision"],
    hasReasoning: true,
    pricing: { input: 0.05, output: 0.4 },
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
