import { STRING_ENUM } from "@/constants/stringEnums";
import { DEFAULT_MODEL, OPENAI_MODELS } from "@/constants/openai-models";

type ModelStage =
  | "chat"
  | "vision"
  | "tool_planner"
  | "research_gate"
  | "research_planner"
  | "research_worker"
  | "research_aggregator"
  | "research_evaluator"
  | "research_formatter"
  | "workspace_agent";

const ALLOWED_MODELS = new Map(OPENAI_MODELS.map((model) => [model.id, model]));

const STAGE_MODEL_FALLBACKS: Record<ModelStage, string> = {
  chat: DEFAULT_MODEL,
  vision: "gpt-5.4-mini",
  tool_planner: "gpt-5.4-nano",
  research_gate: "gpt-5.4-nano",
  research_planner: "gpt-5.4-nano",
  research_worker: "gpt-5.4-mini",
  research_aggregator: "gpt-5.4-mini",
  research_evaluator: "gpt-5.4-nano",
  research_formatter: "gpt-5.4-mini",
  workspace_agent: "gpt-5.4-mini",
};

type ReasoningEffort = "none" | "low" | "medium" | "high" | "xhigh";
type LangChainReasoningEffort = "minimal" | "low" | "medium" | "high";
type ServiceTier = "auto" | "default" | "flex" | "scale" | "priority";
type PromptCacheRetention = "in-memory" | "24h";
type Verbosity = "low" | "medium" | "high";

interface ChatCompletionTuningOptions {
  reasoning_effort?: ReasoningEffort;
  service_tier?: ServiceTier;
  store?: boolean;
  parallel_tool_calls?: boolean;
  prompt_cache_key?: string;
  prompt_cache_retention?: PromptCacheRetention;
  verbosity?: Verbosity;
}

interface LangChainChatTuningOptions {
  reasoning?: {
    effort?: LangChainReasoningEffort;
  };
  service_tier?: ServiceTier;
  promptCacheKey?: string;
  verbosity?: Verbosity;
  zdrEnabled?: boolean;
}

const FAST_INTERACTIVE_REASONING: Record<string, ReasoningEffort> = {
  "gpt-5.5": "low",
  "gpt-5.4": "none",
  "gpt-5.4-mini": "none",
  "gpt-5.4-nano": "none",
  "gpt-5.3-codex": "low",
};

const EXTENDED_PROMPT_CACHE_MODELS = new Set(["gpt-5.5", "gpt-5.4"]);
const SERVICE_TIERS = new Set<ServiceTier>([
  "auto",
  "default",
  "flex",
  "scale",
  "priority",
]);

function toLangChainReasoningEffort(
  effort: ReasoningEffort | undefined,
): LangChainReasoningEffort | undefined {
  if (!effort) {
    return undefined;
  }

  if (effort === STRING_ENUM.NONE) {
    return "minimal";
  }

  if (effort === STRING_ENUM.XHIGH) {
    return "high";
  }

  return effort;
}

function getConfiguredServiceTier(): ServiceTier {
  const configuredTier = process.env.OPENAI_SERVICE_TIER?.trim() as ServiceTier | undefined;

  if (configuredTier && SERVICE_TIERS.has(configuredTier)) {
    return configuredTier;
  }

  return "priority";
}

function isAllowedModel(model: string): boolean {
  return ALLOWED_MODELS.has(model);
}

export function validateRequestedModel(model: string): string | null {
  if (!isAllowedModel(model)) {
    return null;
  }

  return model;
}

export function getStageModel(
  requestedModel: string,
  stage: ModelStage,
): string {
  const validatedRequestedModel = validateRequestedModel(requestedModel);
  if (stage === STRING_ENUM.CHAT) {
    return validatedRequestedModel ?? DEFAULT_MODEL;
  }

  const fallbackModel = STAGE_MODEL_FALLBACKS[stage];
  return (
    validateRequestedModel(fallbackModel) ??
    validatedRequestedModel ??
    DEFAULT_MODEL
  );
}

function supportsCustomTemperature(model: string): boolean {
  const m = model.trim().toLowerCase();
  return !m.startsWith("gpt-5");
}

export function getSupportedTemperature(
  model: string,
  temperature?: number,
): number | undefined {
  if (temperature === undefined) {
    return undefined;
  }

  return supportsCustomTemperature(model) ? temperature : undefined;
}

function getModelContextWindow(model: string): number {
  return ALLOWED_MODELS.get(model)?.contextWindow ?? 128000;
}

export function getResponseTokenReserve(model: string): number {
  const windowSize = getModelContextWindow(model);
  return Math.min(Math.max(Math.floor(windowSize * 0.1), 2048), 16000);
}

export function getOpenAIChatCompletionOptions(
  model: string,
  options: {
    promptCacheKey?: string;
    verbosity?: Verbosity;
  } = {},
): ChatCompletionTuningOptions {
  const validatedModel = validateRequestedModel(model) ?? DEFAULT_MODEL;
  const promptCacheKey = options.promptCacheKey ?? "agentic-chat";
  const tunedOptions: ChatCompletionTuningOptions = {
    reasoning_effort: FAST_INTERACTIVE_REASONING[validatedModel] ?? "low",
    service_tier: getConfiguredServiceTier(),
    store: false,
    parallel_tool_calls: false,
    prompt_cache_key: promptCacheKey,
    verbosity: options.verbosity ?? "low",
  };

  if (EXTENDED_PROMPT_CACHE_MODELS.has(validatedModel)) {
    tunedOptions.prompt_cache_retention = "24h";
  }

  return tunedOptions;
}

export function getLangChainChatModelOptions(
  model: string,
  options: {
    promptCacheKey?: string;
    verbosity?: Verbosity;
  } = {},
): LangChainChatTuningOptions {
  const chatOptions = getOpenAIChatCompletionOptions(model, options);

  return {
    reasoning: {
      effort: toLangChainReasoningEffort(chatOptions.reasoning_effort),
    },
    service_tier: chatOptions.service_tier,
    promptCacheKey: chatOptions.prompt_cache_key,
    verbosity: chatOptions.verbosity,
    zdrEnabled: true,
  };
}
