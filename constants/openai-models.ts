export interface OpenAIModel {
  id: string;
  name: string;
  description: string;
  contextWindow: number;
  category: "reasoning" | "chat" | "legacy";
  capabilities: ("text" | "vision" | "audio" | "video")[];
}

export const OPENAI_MODELS: OpenAIModel[] = [
  // GPT-5 Series (Latest Frontier Models)
  {
    id: "gpt-5",
    name: "GPT-5",
    description: "Best model for coding and agentic tasks",
    contextWindow: 128000,
    category: "chat",
    capabilities: ["text", "vision"],
  },
  {
    id: "gpt-5-mini",
    name: "GPT-5 Mini",
    description: "Faster, cost-efficient version of GPT-5",
    contextWindow: 128000,
    category: "chat",
    capabilities: ["text", "vision"],
  },
  {
    id: "gpt-5-nano-2025-08-07",
    name: "GPT-5 Nano",
    description: "Fastest, most cost-efficient version of GPT-5",
    contextWindow: 128000,
    category: "chat",
    capabilities: ["text", "vision"],
  },
  // GPT-4.1 Series
  {
    id: "gpt-4.1",
    name: "GPT-4.1",
    description: "Smartest non-reasoning model",
    contextWindow: 128000,
    category: "chat",
    capabilities: ["text", "vision"],
  },
  {
    id: "gpt-4.1-mini",
    name: "GPT-4.1 Mini",
    description: "Smaller, faster version of GPT-4.1",
    contextWindow: 128000,
    category: "chat",
    capabilities: ["text", "vision"],
  },
  {
    id: "gpt-4.1-nano",
    name: "GPT-4.1 Nano",
    description: "Fastest, most cost-efficient GPT-4.1",
    contextWindow: 128000,
    category: "chat",
    capabilities: ["text", "vision"],
  },
 
  // GPT-4o Series
  {
    id: "gpt-4o",
    name: "GPT-4o",
    description: "Fast, intelligent, flexible GPT model",
    contextWindow: 128000,
    category: "chat",
    capabilities: ["text", "vision"],
  },
  {
    id: "gpt-4o-mini",
    name: "GPT-4o Mini",
    description: "Fast, affordable small model",
    contextWindow: 128000,
    category: "chat",
    capabilities: ["text", "vision"],
  },
];

export const DEFAULT_MODEL = OPENAI_MODELS[2].id;