import type { ReasoningEffort } from "openai/resources/shared";
import {
  OPENAI_MODELS,
  getDefaultReasoningEffort,
  isReasoningEffortSupported,
  reasoningEffortSchema,
  type ReasoningEffortLevel,
} from "@/constants/openai-models";

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

/**
 * Validates a client-supplied reasoning effort level. Returns the level or
 * null when the value is missing/not one of the supported levels.
 */
export function parseReasoningEffortParam(value: unknown): ReasoningEffortLevel | null {
  const parsed = reasoningEffortSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * Resolves the reasoning effort to send to OpenAI for a chat model.
 * Returns undefined for non-reasoning models (parameter must be omitted).
 * An explicit effort wins when the model supports it; anything else falls
 * back to the model-aware default ("minimal" on the base GPT-5.0 series,
 * which does not accept "none").
 */
export function getChatReasoningEffort(model: string, effort?: ReasoningEffortLevel | null): ReasoningEffort | undefined {
  const minorVersion = getReasoningSeriesMinorVersion(model);
  if (minorVersion === null) return undefined;
  const resolved =
    effort && isReasoningEffortSupported(model, effort)
      ? effort
      : getDefaultReasoningEffort(model);
  if (resolved === "none") return minorVersion >= 1 ? "none" : "minimal";
  return resolved;
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
