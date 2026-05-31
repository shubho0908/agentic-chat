import type { ReasoningEffort } from "openai/resources/shared";
import { OPENAI_MODELS } from "@/constants/openai-models";

const ALLOWED_MODELS = new Map(OPENAI_MODELS.map((model) => [model.id, model]));

function isAllowedModel(model: string): boolean {
  return ALLOWED_MODELS.has(model);
}

export function validateRequestedModel(model: string): string | null {
  if (!isAllowedModel(model)) {
    return null;
  }

  return model;
}

function supportsCustomTemperature(model: string): boolean {
  const m = model.trim().toLowerCase();
  return !m.startsWith("gpt-5");
}

function getReasoningSeriesMinorVersion(model: string): number | null {
  const match = model.trim().toLowerCase().match(/^gpt-5(?:\.(\d+))?(?:\b|-|$)/);
  if (!match) return null;
  return match[1] ? Number(match[1]) : 0;
}

export function getChatReasoningEffort(model: string, thinkingEnabled?: boolean): ReasoningEffort | undefined {
  const minorVersion = getReasoningSeriesMinorVersion(model);
  if (minorVersion === null) return undefined;
  if (thinkingEnabled) return "high";
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
