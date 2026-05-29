import type { ReasoningEffort } from "openai/resources/shared";
import { DEFAULT_MODEL, OPENAI_MODELS } from "@/constants/openai-models";

type ModelStage =
  | "chat"
  | "vision"
  | "tool_planner"
  | "workspace_agent";

const ALLOWED_MODELS = new Map(OPENAI_MODELS.map((model) => [model.id, model]));

const STAGE_MODEL_FALLBACKS: Record<ModelStage, string> = {
  chat: DEFAULT_MODEL,
  vision: "gpt-5.4-mini",
  tool_planner: "gpt-5.4-nano",
  workspace_agent: "gpt-5.4-mini",
};

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
  if (stage === "chat") {
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

function getReasoningSeriesMinorVersion(model: string): number | null {
  const match = model.trim().toLowerCase().match(/^gpt-5(?:\.(\d+))?/);
  if (!match) return null;
  return match[1] ? Number(match[1]) : 0;
}

export function getChatReasoningEffort(model: string): ReasoningEffort | undefined {
  const minorVersion = getReasoningSeriesMinorVersion(model);
  if (minorVersion === null) return undefined;
  return minorVersion >= 1 ? "none" : "minimal";
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
