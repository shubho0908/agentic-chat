import { logInfo, logMetric } from "@/lib/observability";
import type { JevDecisionRecord } from "./types";

export function logJevDecision(record: JevDecisionRecord): void {
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
