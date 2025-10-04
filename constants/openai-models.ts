export interface OpenAIModel {
  id: string;
  name: string;
  description: string;
  contextWindow: number;
  category: "reasoning" | "chat" | "legacy";
}

export const OPENAI_MODELS: OpenAIModel[] = [
  // GPT-5 Series (Latest Frontier Models)
  {
    id: "gpt-5",
    name: "GPT-5",
    description: "Best model for coding and agentic tasks",
    contextWindow: 128000,
    category: "chat",
  },
  {
    id: "gpt-5-mini",
    name: "GPT-5 Mini",
    description: "Faster, cost-efficient version of GPT-5",
    contextWindow: 128000,
    category: "chat",
  },
  {
    id: "gpt-5-nano-2025-08-07",
    name: "GPT-5 Nano",
    description: "Fastest, most cost-efficient version of GPT-5",
    contextWindow: 128000,
    category: "chat",
  },
  // GPT-4.1 Series
  {
    id: "gpt-4.1",
    name: "GPT-4.1",
    description: "Smartest non-reasoning model",
    contextWindow: 128000,
    category: "chat",
  },
  {
    id: "gpt-4.1-mini",
    name: "GPT-4.1 Mini",
    description: "Smaller, faster version of GPT-4.1",
    contextWindow: 128000,
    category: "chat",
  },
  {
    id: "gpt-4.1-nano",
    name: "GPT-4.1 Nano",
    description: "Fastest, most cost-efficient GPT-4.1",
    contextWindow: 128000,
    category: "chat",
  },
  // o-series Reasoning Models
  {
    id: "o3-pro",
    name: "o3 Pro",
    description: "o3 with more compute for better responses",
    contextWindow: 200000,
    category: "reasoning",
  },
  {
    id: "o3",
    name: "o3",
    description: "Reasoning model for complex tasks",
    contextWindow: 200000,
    category: "reasoning",
  },
  {
    id: "o4-mini",
    name: "o4 Mini",
    description: "Fast, cost-efficient reasoning model",
    contextWindow: 128000,
    category: "reasoning",
  },
  {
    id: "o3-mini",
    name: "o3 Mini",
    description: "Small alternative to o3",
    contextWindow: 200000,
    category: "reasoning",
  },
  {
    id: "o1-pro",
    name: "o1 Pro",
    description: "o1 with more compute for better responses",
    contextWindow: 200000,
    category: "reasoning",
  },
  {
    id: "o1",
    name: "o1",
    description: "Previous full o-series reasoning model",
    contextWindow: 200000,
    category: "reasoning",
  },
  {
    id: "o1-mini",
    name: "o1 Mini",
    description: "Small alternative to o1",
    contextWindow: 128000,
    category: "reasoning",
  },
  {
    id: "o1-preview",
    name: "o1 Preview",
    description: "Preview of first o-series reasoning model",
    contextWindow: 128000,
    category: "reasoning",
  },
  // GPT-4o Series
  {
    id: "gpt-4o",
    name: "GPT-4o",
    description: "Fast, intelligent, flexible GPT model",
    contextWindow: 128000,
    category: "chat",
  },
  {
    id: "gpt-4o-mini",
    name: "GPT-4o Mini",
    description: "Fast, affordable small model",
    contextWindow: 128000,
    category: "chat",
  },
  // Legacy Models
  {
    id: "gpt-4-turbo",
    name: "GPT-4 Turbo",
    description: "Older high-intelligence GPT model",
    contextWindow: 128000,
    category: "legacy",
  },
  {
    id: "gpt-4",
    name: "GPT-4",
    description: "Original GPT-4 model",
    contextWindow: 8192,
    category: "legacy",
  },
  {
    id: "gpt-3.5-turbo",
    name: "GPT-3.5 Turbo",
    description: "Legacy model for cheaper tasks",
    contextWindow: 16385,
    category: "legacy",
  },
];

export const DEFAULT_MODEL = "gpt-5-nano-2025-08-07";
