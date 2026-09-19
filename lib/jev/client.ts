import { getCircuitBreaker } from "@/lib/circuitBreaker";
import { withRetry } from "@/lib/retry";
import { logError, logWarn } from "@/lib/observability";
import {
  jevRawResponseSchema,
  type JevAnswers,
  type JevEvaluateInput,
  type JevUsage,
} from "./types";

const JEV_MODEL_ID = "typesafe/jev";
const CIRCUIT_BREAKER_NAME = "jev-decision-client";
const DEFAULT_TIMEOUT_MS = 2_000;
const MAX_RETRIES = 1;

export class JevConfigurationError extends Error {
  constructor() {
    super(
      "Jev is not configured: CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required",
    );
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
/** Single adapter for all Jev evaluations: owns transport, deadlines, bounded
 * retries, Zod response validation, and circuit breaking. Checkpoints own
 * their question definitions, thresholds, and fallbacks. */
export class JevDecisionClient {
  private readonly accountId: string;
  private readonly apiToken: string;

  constructor(options?: { accountId?: string; apiToken?: string }) {
    const accountId = options?.accountId ?? process.env.CLOUDFLARE_ACCOUNT_ID;
    const apiToken = options?.apiToken ?? process.env.CLOUDFLARE_API_TOKEN;
    if (!accountId || !apiToken) {
      throw new JevConfigurationError();
    }
    this.accountId = accountId;
    this.apiToken = apiToken;
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
    const url = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/run`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: JEV_MODEL_ID,
        input: { state: input.state, questions: input.questions },
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

