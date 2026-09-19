import { getCircuitBreaker } from "@/lib/circuitBreaker";
import { withRetry } from "@/lib/retry";
import { logError, logWarn } from "@/lib/observability";
import {
  JevProvider,
  jevRawResponseSchema,
  type JevAnswers,
  type JevEvaluateInput,
  type JevProviderName,
  type JevUsage,
} from "./types";

const CIRCUIT_BREAKER_NAME = "jev-decision-client";
const DEFAULT_TIMEOUT_MS = 2_000;
const MAX_RETRIES = 1;

const PROVIDER_CONFIG: Record<
  JevProviderName,
  { url: string | ((accountId: string) => string); model: string; wrapInput: boolean }
> = {
  [JevProvider.TYPESAFE]: {
    url: "https://api.typesafe.ai/v1/systemone",
    model: "jev-latest",
    wrapInput: false,
  },
  [JevProvider.CLOUDFLARE]: {
    url: (accountId) =>
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run`,
    model: "typesafe/jev",
    wrapInput: true,
  },
};

export class JevConfigurationError extends Error {
  constructor(message: string) {
    super(message);
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

export interface JevClientOptions {
  provider?: JevProviderName;
  apiKey?: string;
  accountId?: string;
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
/** Single adapter for all Jev evaluations: owns transport (direct TypeSafe
 * API by default, Cloudflare Workers AI as fallback), deadlines, bounded
 * retries, Zod response validation, and circuit breaking. */
export class JevDecisionClient {
  private readonly provider: JevProviderName;
  private readonly apiKey: string;
  private readonly accountId?: string;

  constructor(options?: JevClientOptions) {
    const provider =
      options?.provider ??
      (process.env.JEV_PROVIDER === JevProvider.CLOUDFLARE
        ? JevProvider.CLOUDFLARE
        : JevProvider.TYPESAFE);

    if (provider === JevProvider.TYPESAFE) {
      const apiKey = options?.apiKey ?? process.env.TYPESAFE_API_KEY;
      if (!apiKey) {
        throw new JevConfigurationError(
          "Jev is not configured: TYPESAFE_API_KEY is required for the typesafe provider",
        );
      }
      this.provider = provider;
      this.apiKey = apiKey;
      return;
    }

    const accountId = options?.accountId ?? process.env.CLOUDFLARE_ACCOUNT_ID;
    const apiKey = options?.apiKey ?? process.env.CLOUDFLARE_API_TOKEN;
    if (!accountId || !apiKey) {
      throw new JevConfigurationError(
        "Jev is not configured: CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required for the cloudflare provider",
      );
    }
    this.provider = provider;
    this.apiKey = apiKey;
    this.accountId = accountId;
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
    const cfg = PROVIDER_CONFIG[this.provider];
    const url = typeof cfg.url === "function" ? cfg.url(this.accountId ?? "") : cfg.url;
    const payload = { state: input.state, questions: input.questions };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(
        cfg.wrapInput
          ? { model: cfg.model, input: payload }
          : { model: cfg.model, ...payload },
      ),
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

