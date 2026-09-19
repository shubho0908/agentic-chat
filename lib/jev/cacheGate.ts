import { createRequestId, logWarn } from "@/lib/observability";
import { JevDecisionClient } from "./client";
import { getJevMode } from "./config";
import { logJevDecision } from "./telemetry";
import {
  JevCheckpoint,
  JevFallbackReason,
  JevMode,
  type JevQuestions,
} from "./types";

export const JEV_CACHE_GATE_SCHEMA_VERSION = "1.0.0";
export const JEV_CACHE_GATE_TIMEOUT_MS = 2_000;

/** Structural signals only. The cached question and answer never leave for
 * the external evaluation API - the gate judges the hit by its shape
 * (similarity margin, age, scoping, sizes), not its content. */
export interface JevCacheGateState {
  similarityScore: number;
  similarityThreshold: number;
  scoreMargin: number;
  cacheAgeSeconds: number;
  cacheTtlSeconds: number;
  entryScopedToConversation: boolean;
  queryLengthChars: number;
  answerLengthChars: number;
}

export interface JevCacheGateDecision {
  serveFromCache: number;
  stalenessRisk: number;
}

export const JEV_CACHE_GATE_QUESTIONS: JevQuestions = {
  serve_from_cache: {
    type: "noul",
    instructions:
      "Is this semantic cache hit safe to serve instead of generating a fresh answer?",
    criteria: {
      true: "The similarity score clears the threshold with margin and the entry is fresh enough that the stored answer still applies.",
      false: "The similarity is marginal or the entry is old enough that the stored answer may no longer fit the query.",
    },
  },
  staleness_risk: {
    type: "noul",
    instructions:
      "Does serving this cached answer risk being outdated or mismatched for the current query?",
    criteria: {
      true: "Age, thin score margin, or loose scoping make a stale or off-target answer plausible.",
      false: "The entry is recent, strongly matched, and scoped tightly enough to trust.",
    },
  },
};

/** Returns null when any answer is missing or mistyped; callers treat null
 * as invalid and keep the production cache behavior. */
export function mapJevCacheGateResult(
  result: Awaited<ReturnType<JevDecisionClient["evaluate"]>>,
): JevCacheGateDecision | null {
  const serveAnswer = result.answers.serve_from_cache;
  const staleAnswer = result.answers.staleness_risk;
  if (serveAnswer?.type !== "noul") return null;
  if (staleAnswer?.type !== "noul") return null;
  return {
    serveFromCache: serveAnswer.noul,
    stalenessRisk: staleAnswer.noul,
  };
}

/** One confident signal is enough to veto: a false veto costs one fresh
 * generation, while a false serve hands the user a stale answer. */
export function shouldServeCachedAnswer(decision: JevCacheGateDecision): boolean {
  return decision.serveFromCache >= 0.5 && decision.stalenessRisk < 0.5;
}

export interface CacheGateOutcome {
  serve: boolean;
}

/** In active mode the client pre-check must not serve or veto on its own:
 * the request falls through to the orchestrator, which performs the single
 * authoritative gated lookup. Two independent Jev evaluations of the same
 * entry can disagree, and a first-path veto overridden by a second-path
 * serve (or a fail-open) would make the gate meaningless. Shadow/ab keep
 * the fast path because they never change behavior. */
export function cacheGateDefersToOrchestrator(): boolean {
  return getJevMode(JevCheckpoint.CACHE_GATE) === JevMode.ACTIVE;
}

/** Default is off. Shadow and ab record the decision but always serve the
 * hit. Active vetoes only confident no-serve decisions and fails open on
 * provider errors: a Jev outage can never turn cache hits into misses. */
export async function gateCacheHit(
  state: JevCacheGateState,
  conversationId?: string,
  dependency?: JevDecisionClient,
): Promise<CacheGateOutcome> {
  const mode = getJevMode(JevCheckpoint.CACHE_GATE);
  const client = dependency ?? JevDecisionClient.createIfConfigured();
  if (mode === JevMode.OFF || !client) return { serve: true };

  const requestId = createRequestId("jev_cache_gate");
  const startedAt = Date.now();
  try {
    const result = await client.evaluate({
      checkpoint: JevCheckpoint.CACHE_GATE,
      schemaVersion: JEV_CACHE_GATE_SCHEMA_VERSION,
      state,
      questions: JEV_CACHE_GATE_QUESTIONS,
      timeoutMs: JEV_CACHE_GATE_TIMEOUT_MS,
      traceContext: { requestId, conversationId },
    });
    const decision = mapJevCacheGateResult(result);
    if (!decision) {
      logJevDecision({
        checkpoint: JevCheckpoint.CACHE_GATE,
        schemaVersion: JEV_CACHE_GATE_SCHEMA_VERSION,
        modelVersion: result.modelVersion,
        mode,
        latencyMs: Date.now() - startedAt,
        outcome: "invalid_response_serve",
        fallbackUsed: true,
        fallbackReason: JevFallbackReason.INVALID,
        requestId,
        conversationId,
        inputTokens: result.usage?.input_tokens,
        outputTokens: result.usage?.output_tokens,
      });
      return { serve: true };
    }

    const jevWouldServe = shouldServeCachedAnswer(decision);
    const serve = mode === JevMode.ACTIVE ? jevWouldServe : true;
    logJevDecision({
      checkpoint: JevCheckpoint.CACHE_GATE,
      schemaVersion: JEV_CACHE_GATE_SCHEMA_VERSION,
      modelVersion: result.modelVersion,
      mode,
      latencyMs: Date.now() - startedAt,
      outcome:
        mode === JevMode.ACTIVE
          ? serve
            ? "serve"
            : "veto"
          : jevWouldServe
            ? "serve"
            : "would_veto",
      probabilities: {
        serveFromCache: decision.serveFromCache,
        stalenessRisk: decision.stalenessRisk,
      },
      fallbackUsed: false,
      requestId,
      conversationId,
      inputTokens: result.usage?.input_tokens,
      outputTokens: result.usage?.output_tokens,
    });
    return { serve };
  } catch (error) {
    logWarn({
      event: "jev_cache_gate_fallback",
      message: "Cache gate failed open",
      error: error instanceof Error ? error.message : String(error),
      requestId,
    });
    logJevDecision({
      checkpoint: JevCheckpoint.CACHE_GATE,
      schemaVersion: JEV_CACHE_GATE_SCHEMA_VERSION,
      modelVersion: "unknown",
      mode,
      latencyMs: Date.now() - startedAt,
      outcome: "error_serve",
      fallbackUsed: true,
      fallbackReason:
        error instanceof Error && error.name === "AbortError"
          ? JevFallbackReason.TIMEOUT
          : JevFallbackReason.ERROR,
      requestId,
      conversationId,
    });
    return { serve: true };
  }
}
