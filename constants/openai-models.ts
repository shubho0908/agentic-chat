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

/**
 * Models available in this app as of 2026-09-03.
 *
 * Curated to the latest two OpenAI generations — GPT-5.6 and GPT-5.5 — and
 * their reasoning/Pro variants. Older GPT-5.x families (5.4, 5.2, 5.0) and
 * pre-GPT-5 models are intentionally excluded because:
 *
 *   • GPT-5.0/o3 snapshots are scheduled for shutdown on 2026-12-11
 *     (https://platform.openai.com/docs/deprecations).
 *   • GPT-5.4 has been superseded by GPT-5.5 and GPT-5.6 (cheaper, larger
 *     context windows, more recent knowledge cutoff).
 *   • Pre-GPT-5 chat/audio/realtime families were retired in mid-2026.
 *
 * GPT-5.6 Sol/Terra/Luna are the current OpenAI-recommended lineup.
 * GPT-5.5 + GPT-5.5 Pro are kept for users who prefer the previous
 * generation. Specialized aliases (e.g. gpt-5.6-cyber, gpt-5.6-chat-latest,
 * codex variants, audio/realtime) are out of scope for this chat surface.
 */
export const OPENAI_MODELS: OpenAIModel[] = [
  // ─── GPT-5.6 (current flagship, Feb 16 2026 knowledge cutoff) ───────────
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
    pricing: { input: 0.2, output: 1.2 },
  },

  // ─── GPT-5.5 (previous flagship, Dec 1 2025 knowledge cutoff) ────────────
  {
    id: "gpt-5.5",
    name: "GPT-5.5",
    description:
      "Previous-generation flagship for coding and professional work",
    contextWindow: 1050000,
    category: "reasoning",
    capabilities: ["text", "vision"],
    hasReasoning: true,
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