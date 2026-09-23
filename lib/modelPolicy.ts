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

/**
 * GPT reasoning series: "gpt-5", "gpt-5.6-terra", "gpt-6-astra". Non-reasoning
 * families (gpt-4o, gpt-4.1, the o-series) deliberately do not match.
 */
const REASONING_SERIES_PATTERN = /^gpt-(\d+)(?:\.(\d+))?(?:\b|-|$)/;

/** First major version of the reasoning series; GPT-4.x and earlier are out. */
const FIRST_REASONING_SERIES_MAJOR = 5;

/** First GPT-5 point release that accepts reasoning effort "none". */
const NONE_EFFORT_FIRST_MINOR = 1;

interface ReasoningSeriesVersion {
  major: number;
  minor: number;
}

/**
 * Parses the generation and point release of a reasoning-series model id:
 * "gpt-5" → {5, 0}, "gpt-5.6-terra" → {5, 6}, "gpt-6-astra" → {6, 0}.
 * Returns null for anything outside the reasoning series.
 */
function getReasoningSeriesVersion(model: string): ReasoningSeriesVersion | null {
  const match = model.trim().toLowerCase().match(REASONING_SERIES_PATTERN);
  if (!match) return null;
  const major = Number(match[1]);
  if (major < FIRST_REASONING_SERIES_MAJOR) return null;
  return { major, minor: match[2] ? Number(match[2]) : 0 };
}

/**
 * Custom temperature (and top_p) is rejected while a reasoning pass runs, so it
 * is omitted for every model from the GPT-5 series onwards rather than tracking
 * the per-request effort.
 * Source: https://developers.openai.com/api/docs/guides/latest-model
 */
function supportsCustomTemperature(model: string): boolean {
  return getReasoningSeriesVersion(model) === null;
}

/**
 * Tool calling on the GPT-6 family requires the Responses API: Chat
 * Completions supports function calling for GPT-6 Sol/Luna only with
 * reasoning effort "none", and not at all for GPT-6 Astra.
 * Source: https://developers.openai.com/api/docs/guides/latest-model#update-api-and-model-parameters
 */
export function requiresResponsesApiForToolCalling(model: string): boolean {
  const version = getReasoningSeriesVersion(model);
  return version !== null && version.major >= 6;
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
  const version = getReasoningSeriesVersion(model);
  if (version === null) return undefined;
  const resolved =
    effort && isReasoningEffortSupported(model, effort)
      ? effort
      : getDefaultReasoningEffort(model);
  if (resolved === "none") {
    // "none" landed with the GPT-5.1 series; the base GPT-5.0 series predates
    // it and answers without a reasoning pass through "minimal" instead.
    return version.major > FIRST_REASONING_SERIES_MAJOR ||
      version.minor >= NONE_EFFORT_FIRST_MINOR
      ? "none"
      : "minimal";
  }
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
