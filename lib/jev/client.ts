import { getCircuitBreaker } from "@/lib/circuitBreaker";
import { withRetry } from "@/lib/retry";
import { logError, logWarn } from "@/lib/observability";
import {
  jevRawResponseSchema,
  type JevAnswers,
  type JevEvaluateInput,
  type JevUsage,
} from "./types";

const TYPESAFE_API_URL = "https://api.typesafe.ai/v1/systemone";
const JEV_MODEL_ID = "jev-latest";
const CIRCUIT_BREAKER_NAME = "jev-decision-client";
const DEFAULT_TIMEOUT_MS = 2_000;
const MAX_RETRIES = 1;

export class JevConfigurationError extends Error {
  constructor() {
    super("Jev is not configured: TYPESAFE_API_KEY is required");
    this.name = "JevConfigurationError";
  }
}

export class JevCircuitOpenError extends Error {
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
    try {
      const raw = await withRetry((signal) => this.invoke(input, signal), {
        retries: MAX_RETRIES,
        initialDelayMs: 300,
        timeoutMs: input.timeoutMs > 0 ? input.timeoutMs : DEFAULT_TIMEOUT_MS,
      });
      const validated = parseResponse(raw);
      breaker.recordSuccess();
      return { ...validated, latencyMs: Date.now() - startedAt };
    } catch (error) {
      if (!(error instanceof JevInvalidResponseError)) {
        breaker.recordFailure();
      }
      logError({
        event: "jev_evaluate_failed",
        checkpoint: input.checkpoint,
        schemaVersion: input.schemaVersion,
        requestId: input.traceContext.requestId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
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

