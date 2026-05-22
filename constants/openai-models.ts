interface OpenAIModel {
  id: string;
  name: string;
  description: string;
  contextWindow: number;
  category: "frontier" | "fast" | "coding";
  capabilities: ("text" | "vision" | "audio" | "video")[];
  hasReasoning?: boolean;
  recommended?: boolean;
}

export const OPENAI_MODELS: OpenAIModel[] = [
  // Latest GPT-5+ Chat Completions-compatible models.
  // Source of truth: OpenAI model catalog and latest-model guide.
  {
    id: "gpt-5.5",
    name: "GPT-5.5",
    description: "Newest frontier model for complex coding and professional work",
    contextWindow: 1050000,
    category: "frontier",
    capabilities: ["text", "vision"],
    hasReasoning: true,
  },
  {
    id: "gpt-5.4",
    name: "GPT-5.4",
    description:
      "Affordable frontier model for coding and professional work",
    contextWindow: 1050000,
    category: "frontier",
    capabilities: ["text", "vision"],
    hasReasoning: true,
  },
  {
    id: "gpt-5.4-mini",
    name: "GPT-5.4 Mini",
    description:
      "Fast, strong GPT-5.4 model for interactive chat, tools, and subagents",
    contextWindow: 400000,
    category: "fast",
    capabilities: ["text", "vision"],
    hasReasoning: true,
    recommended: true,
  },
  {
    id: "gpt-5.4-nano",
    name: "GPT-5.4 Nano",
    description: "Fastest, cheapest GPT-5.4 model for simple high-volume tasks",
    contextWindow: 400000,
    category: "fast",
    capabilities: ["text", "vision"],
    hasReasoning: true,
  },
  {
    id: "gpt-5.3-codex",
    name: "GPT-5.3 Codex",
    description: "Latest GPT-5 coding model for agentic software tasks",
    contextWindow: 400000,
    category: "coding",
    capabilities: ["text", "vision"],
    hasReasoning: true,
  },
];

export const DEFAULT_MODEL = "gpt-5.4-mini";
