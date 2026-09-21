import { getCircuitBreaker } from "@/lib/circuitBreaker";
import { withRetry } from "@/lib/retry";
import { logError, logInfo, logWarn } from "@/lib/observability";
import {
  JevFallbackReason,
  jevRawResponseSchema,
  type JevAnswers,
  type JevEvaluateInput,
  type JevFallbackReasonValue,
  type JevUsage,
} from "./types";

const TYPESAFE_API_URL = "https://api.typesafe.ai/v1/systemone";
const JEV_MODEL_ID = "jev-latest";
const CIRCUIT_BREAKER_NAME = "jev-decision-client";
const DEFAULT_TIMEOUT_MS = 2_000;
const MAX_RETRIES = 1;

let legacyProviderWarned = false;

/** Cloudflare transport was removed before merge. Warn once when legacy
 * vars are still set so the fallback to disabled Jev is never silent. */
function warnOnLegacyProviderVars(): void {
  if (legacyProviderWarned) return;
  if (
    process.env.JEV_PROVIDER ??
    process.env.CLOUDFLARE_ACCOUNT_ID ??
    process.env.CLOUDFLARE_API_TOKEN
  ) {
    legacyProviderWarned = true;
    logWarn({
      event: "jev_legacy_provider_ignored",
      message:
        "Cloudflare Jev provider is removed; set TYPESAFE_API_KEY for the direct TypeSafe API",
    });
  }
}

export class JevConfigurationError extends Error {
  constructor() {
    super("Jev is not configured: TYPESAFE_API_KEY is required");
    this.name = "JevConfigurationError";
  }
}

class JevCircuitOpenError extends Error {
  constructor() {
    super("Jev circuit breaker is open");
    this.name = "JevCircuitOpenError";
  }
}

export class JevInvalidResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JevInvalidResponseError";
  }
}

/** The evaluation spent its own budget. Expected in shadow mode (cold starts
 *  miss by design), so it is reported as a budget miss rather than a fault. */
export class JevEvaluationTimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(timeoutMs: number, options?: { cause?: unknown }) {
    super(`Jev evaluation exceeded its ${timeoutMs}ms budget`, options);
    this.name = "JevEvaluationTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

/** The caller aborted: the request was cancelled, or a sibling fan-out call had
 *  already failed. Expected, and never evidence about provider health. */
export class JevEvaluationCancelledError extends Error {
  constructor(options?: { cause?: unknown }) {
    super("Jev evaluation cancelled by caller", options);
    this.name = "JevEvaluationCancelledError";
  }
}

/** Stricter than `isAbortError` in the retry layer: telemetry classification
 *  keys off the structural name only, never a message heuristic. */
function hasAbortName(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { name?: unknown }).name === "AbortError"
  );
}

/** Single classification for every checkpoint's fallback record, kept beside
 *  the errors it recognises so telemetry cannot drift from this client. */
export function classifyJevFailure(error: unknown): JevFallbackReasonValue {
  if (error instanceof JevEvaluationCancelledError) return JevFallbackReason.CANCELLED;
  if (error instanceof JevEvaluationTimeoutError) return JevFallbackReason.TIMEOUT;
  if (hasAbortName(error)) return JevFallbackReason.TIMEOUT;
  if (error instanceof JevCircuitOpenError) return JevFallbackReason.CIRCUIT_OPEN;
  if (error instanceof JevInvalidResponseError) return JevFallbackReason.INVALID;
  return JevFallbackReason.ERROR;
}

export interface JevEvaluateResult {
  answers: JevAnswers;
  modelVersion: string;
  usage?: JevUsage;
  latencyMs: number;
}

function parseResponse(raw: unknown): {
  answers: JevAnswers;
  modelVersion: string;
  usage?: JevUsage;
} {
  const parsed = jevRawResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new JevInvalidResponseError(
      parsed.error.issues[0]?.message ?? "Invalid Jev response",
    );
  }
  const { model, answers, usage } = parsed.data;
  if (Object.keys(answers).length === 0) {
    throw new JevInvalidResponseError("Jev response answers object is empty");
  }
  return { answers, modelVersion: model ?? "unknown", usage };
}
/** Single adapter for all Jev evaluations over the TypeSafe API: owns
 * transport, deadlines, bounded retries, Zod response validation, and circuit
 * breaking. Checkpoints own their question definitions, thresholds, fallbacks. */
export class JevDecisionClient {
  private readonly apiKey: string;

  constructor(options?: { apiKey?: string }) {
    warnOnLegacyProviderVars();
    const apiKey = options?.apiKey ?? process.env.TYPESAFE_API_KEY;
    if (!apiKey) {
      throw new JevConfigurationError();
    }
    this.apiKey = apiKey;
  }

  static createIfConfigured(): JevDecisionClient | null {
    try {
      return new JevDecisionClient();
    } catch (error) {
      if (error instanceof JevConfigurationError) return null;
      throw error;
    }
  }

  async evaluate(input: JevEvaluateInput): Promise<JevEvaluateResult> {
    const breaker = getCircuitBreaker(CIRCUIT_BREAKER_NAME);
    if (!breaker.canAttempt()) {
      logWarn({
        event: "jev_circuit_open",
        checkpoint: input.checkpoint,
        requestId: input.traceContext.requestId,
      });
      throw new JevCircuitOpenError();
    }

    const startedAt = Date.now();
    const deadlineMs =
      input.timeoutMs > 0 ? input.timeoutMs : DEFAULT_TIMEOUT_MS;
    const deadlineController = new AbortController();
    const deadlineTimer = setTimeout(() => {
      const timeoutError = new Error("Jev evaluation timed out");
      timeoutError.name = "AbortError";
      deadlineController.abort(timeoutError);
    }, deadlineMs);
    const externalSignal = input.signal;
    const onExternalAbort = () => {
      const cancelError = new Error("Jev evaluation cancelled by caller");
      cancelError.name = "AbortError";
      deadlineController.abort(cancelError);
    };
    if (externalSignal?.aborted) {
      onExternalAbort();
    } else {
      externalSignal?.addEventListener("abort", onExternalAbort, {
        once: true,
      });
    }
    try {
      // No per-attempt timeout here: `deadlineController` is the single budget
      // for the whole call, and withRetry enforces it as a hard bound.
      const raw = await withRetry((signal) => this.invoke(input, signal), {
        retries: MAX_RETRIES,
        initialDelayMs: 300,
        signal: deadlineController.signal,
      });
      const validated = parseResponse(raw);
      breaker.recordSuccess();
      return { ...validated, latencyMs: Date.now() - startedAt };
    } catch (error) {
      const cancelled = externalSignal?.aborted === true;
      const timedOut =
        !cancelled && hasAbortName(error) && deadlineController.signal.aborted;
      const failure = cancelled
        ? new JevEvaluationCancelledError({ cause: error })
        : timedOut
          ? new JevEvaluationTimeoutError(deadlineMs, { cause: error })
          : error;

      // Caller-cancelled work says nothing about provider health; counting it
      // would let one abandoned fan-out poison the breaker for later calls.
      if (!(error instanceof JevInvalidResponseError) && !cancelled) {
        breaker.recordFailure();
      }

      const diagnostics = {
        checkpoint: input.checkpoint,
        schemaVersion: input.schemaVersion,
        requestId: input.traceContext.requestId,
        latencyMs: Date.now() - startedAt,
        errorName: failure instanceof Error ? failure.name : typeof failure,
        error: failure instanceof Error ? failure.message : String(failure),
      };

      // One taxonomy for both the log line and the durable fallback record, so
      // the two can never disagree. Only genuine faults (transport, HTTP status)
      // reach error level; budget misses and cancellations are expected.
      const reason = classifyJevFailure(failure);

      if (failure instanceof JevEvaluationCancelledError) {
        logInfo({ event: "jev_evaluate_cancelled", reason, ...diagnostics });
      } else if (reason === JevFallbackReason.ERROR) {
        logError({ event: "jev_evaluate_failed", reason, ...diagnostics });
      } else {
        logWarn({
          event: "jev_evaluate_failed",
          reason,
          ...(failure instanceof JevEvaluationTimeoutError && { timeoutMs: deadlineMs }),
          ...diagnostics,
        });
      }

      throw failure;
    } finally {
      clearTimeout(deadlineTimer);
      externalSignal?.removeEventListener("abort", onExternalAbort);
    }
  }

  private async invoke(
    input: JevEvaluateInput,
    signal?: AbortSignal,
  ): Promise<unknown> {
    const response = await fetch(TYPESAFE_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: JEV_MODEL_ID,
        state: input.state,
        questions: input.questions,
      }),
      signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      const error = new Error(
        `Jev request failed with status ${response.status}: ${body.slice(0, 200)}`,
      );
      (error as Error & { status?: number }).status = response.status;
      throw error;
    }

    return response.json();
  }
}

