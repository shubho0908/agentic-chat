export interface OpenAIModel {
  id: string;
  name: string;
  description: string;
  contextWindow: number;
  category: "reasoning" | "chat" | "legacy";
  capabilities: ("text" | "vision" | "audio" | "video")[];
  hasReasoning?: boolean;
  recommended?: boolean;
}

export const OPENAI_MODELS: OpenAIModel[] = [
  // GPT-5 Series
  {
    id: "gpt-5.4",
    name: "GPT-5.4",
    description: "Best intelligence at scale for agentic, coding, and professional workflows",
    contextWindow: 1050000,
    category: "reasoning",
    capabilities: ["text", "vision"],
    hasReasoning: true,
    recommended: true,
  },
  {
    id: "gpt-5.2",
    name: "GPT-5.2",
    description: "Previous frontier GPT-5 model for complex professional work",
    contextWindow: 400000,
    category: "reasoning",
    capabilities: ["text", "vision"],
    hasReasoning: true,
  },
  {
    id: "gpt-5.2-codex",
    name: "GPT-5.2 Codex",
    description: "Specialized GPT-5 model for long-horizon, agentic coding tasks",
    contextWindow: 400000,
    category: "reasoning",
    capabilities: ["text", "vision"],
    hasReasoning: true,
  },
  {
    id: "gpt-5",
    name: "GPT-5",
    description: "Previous GPT-5 reasoning model for coding and agentic tasks",
    contextWindow: 400000,
    category: "reasoning",
    capabilities: ["text", "vision"],
    hasReasoning: true,
  },
  {
    id: "gpt-5-mini",
    name: "GPT-5 Mini",
    description: "Near-frontier GPT-5 model for lower latency and cost",
    contextWindow: 400000,
    category: "reasoning",
    capabilities: ["text", "vision"],
    hasReasoning: true,
  },
  {
    id: "gpt-5-nano",
    name: "GPT-5 Nano",
    description: "Fastest, cheapest GPT-5 model for classification and summarization",
    contextWindow: 400000,
    category: "reasoning",
    capabilities: ["text", "vision"],
    hasReasoning: true,
  },
];

export const DEFAULT_MODEL = "gpt-5.4";
