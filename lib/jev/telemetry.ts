import { logInfo, logMetric, logWarn } from "@/lib/observability";
import { prisma } from "@/lib/prisma";
import type { JevDecisionRecord } from "./types";

/** Durable copy of the redacted decision record. Fire-and-forget: callers
 * never await it and a database failure must never affect a request. Only
 * attempted when a database is configured, so unit tests stay offline. */
async function persistJevDecision(record: JevDecisionRecord): Promise<void> {
  await prisma.jevDecision.create({
    data: {
      checkpoint: record.checkpoint,
      schemaVersion: record.schemaVersion,
      modelVersion: record.modelVersion,
      mode: record.mode,
      outcome: record.outcome,
      probabilities: record.probabilities ?? undefined,
      confidence: record.confidence ?? null,
      fallbackUsed: record.fallbackUsed,
      fallbackReason: record.fallbackReason ?? null,
      inputTokens: record.inputTokens ?? null,
      outputTokens: record.outputTokens ?? null,
      latencyMs: Math.round(record.latencyMs),
      requestId: record.requestId ?? null,
      conversationId: record.conversationId ?? null,
    },
  });
}

export function logJevDecision(record: JevDecisionRecord): void {
  if (process.env.DATABASE_URL && process.env.NODE_ENV !== "test") {
    void persistJevDecision(record).catch((error) =>
      logWarn({
        event: "jev_decision_persist_failed",
        checkpoint: record.checkpoint,
        requestId: record.requestId,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  }

  logInfo({
    event: "jev_decision",
    checkpoint: record.checkpoint,
    schemaVersion: record.schemaVersion,
    modelVersion: record.modelVersion,
    mode: record.mode,
    latencyMs: record.latencyMs,
    outcome: record.outcome,
    probabilities: record.probabilities,
    confidence: record.confidence,
    fallbackUsed: record.fallbackUsed,
    fallbackReason: record.fallbackReason,
    inputTokens: record.inputTokens,
    outputTokens: record.outputTokens,
    requestId: record.requestId,
    conversationId: record.conversationId,
  });

  logMetric({
    metric: "jev_decision_total",
    value: 1,
    unit: "count",
    checkpoint: record.checkpoint,
    mode: record.mode,
    fallback: record.fallbackUsed,
  });

  logMetric({
    metric: "jev_decision_latency_ms",
    value: record.latencyMs,
    unit: "ms",
    checkpoint: record.checkpoint,
  });
}
