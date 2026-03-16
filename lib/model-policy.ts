import { DEFAULT_MODEL, OPENAI_MODELS } from '@/constants/openai-models';

export type ModelStage =
  | 'chat'
  | 'vision'
  | 'tool_planner'
  | 'research_gate'
  | 'research_planner'
  | 'research_worker'
  | 'research_aggregator'
  | 'research_evaluator'
  | 'research_formatter'
  | 'workspace_agent';

const ALLOWED_MODELS = new Map(OPENAI_MODELS.map((model) => [model.id, model]));

const STAGE_MODEL_FALLBACKS: Record<ModelStage, string> = {
  chat: DEFAULT_MODEL,
  vision: 'gpt-5-mini',
  tool_planner: 'gpt-5-nano',
  research_gate: 'gpt-5-nano',
  research_planner: 'gpt-5-nano',
  research_worker: 'gpt-5-mini',
  research_aggregator: 'gpt-5-mini',
  research_evaluator: 'gpt-5-nano',
  research_formatter: 'gpt-5-mini',
  workspace_agent: 'gpt-5-mini',
};

export function isAllowedModel(model: string): boolean {
  return ALLOWED_MODELS.has(model);
}

export function validateRequestedModel(model: string): string | null {
  if (!isAllowedModel(model)) {
    return null;
  }

  return model;
}

export function getStageModel(requestedModel: string, stage: ModelStage): string {
  const validatedRequestedModel = validateRequestedModel(requestedModel);
  if (stage === 'chat') {
    return validatedRequestedModel ?? DEFAULT_MODEL;
  }

  const fallbackModel = STAGE_MODEL_FALLBACKS[stage];
  return validateRequestedModel(fallbackModel) ?? validatedRequestedModel ?? DEFAULT_MODEL;
}

export function supportsCustomTemperature(model: string): boolean {
  return !model.trim().toLowerCase().startsWith('gpt-5');
}

export function getSupportedTemperature(model: string, temperature?: number): number | undefined {
  if (temperature === undefined) {
    return undefined;
  }

  return supportsCustomTemperature(model) ? temperature : undefined;
}

export function getModelContextWindow(model: string): number {
  return ALLOWED_MODELS.get(model)?.contextWindow ?? 128000;
}

export function getResponseTokenReserve(model: string): number {
  const windowSize = getModelContextWindow(model);
  return Math.min(Math.max(Math.floor(windowSize * 0.1), 2048), 16000);
}
