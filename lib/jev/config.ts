import {
  JevCheckpoint,
  JevMode,
  JevOnFailure,
  type JevCheckpointName,
  type JevModeValue,
  type JevOnFailureValue,
} from "./types";

const ENV_BY_CHECKPOINT: Record<JevCheckpointName, string> = {
  [JevCheckpoint.CACHE_GATE]: "JEV_CACHE_GATE_MODE",
  [JevCheckpoint.RERANK]: "JEV_RERANK_MODE",
  [JevCheckpoint.PASSAGE_GATE]: "JEV_PASSAGE_GATE_MODE",
  [JevCheckpoint.PLANNER]: "JEV_PLANNER_MODE",
  [JevCheckpoint.TOOL_ROUTER]: "JEV_TOOL_ROUTER_MODE",
  [JevCheckpoint.HITL_ESCALATION]: "JEV_HITL_ESCALATION_MODE",
  [JevCheckpoint.MEMORY_GATE]: "JEV_MEMORY_GATE_MODE",
  [JevCheckpoint.MEMORY_EVIDENCE]: "JEV_MEMORY_EVIDENCE_MODE",
  [JevCheckpoint.MEMORY_STORAGE]: "JEV_MEMORY_STORAGE_MODE",
};

const MODE_VALUES = new Set<string>(Object.values(JevMode));

export function getJevMode(checkpoint: JevCheckpointName): JevModeValue {
  const raw = process.env[ENV_BY_CHECKPOINT[checkpoint]]?.trim().toLowerCase();
  return raw && MODE_VALUES.has(raw) ? (raw as JevModeValue) : JevMode.OFF;
}

export function isJevEnabled(checkpoint: JevCheckpointName): boolean {
  return getJevMode(checkpoint) !== JevMode.OFF;
}

/** Failure posture for gates with a real open/closed polarity, keyed beside
 * the mode vars so one place owns every Jev env read. Open keeps serving
 * through a provider failure (serve the hit, keep the passages, fall back to
 * the legacy heuristic); closed refuses unevaluated content. Defaults match
 * the behavior each gate shipped with. Shadow-only checkpoints and the
 * deterministic-fallback checkpoints (planner, tool router, HITL, rerank)
 * have no second posture to configure, so they take no var. */
const ON_FAILURE_POLICY = {
  [JevCheckpoint.CACHE_GATE]: {
    env: "JEV_CACHE_GATE_ON_FAILURE",
    fallback: JevOnFailure.CLOSED,
  },
  [JevCheckpoint.PASSAGE_GATE]: {
    env: "JEV_PASSAGE_GATE_ON_FAILURE",
    fallback: JevOnFailure.OPEN,
  },
  [JevCheckpoint.MEMORY_GATE]: {
    env: "JEV_MEMORY_GATE_ON_FAILURE",
    fallback: JevOnFailure.OPEN,
  },
  [JevCheckpoint.MEMORY_EVIDENCE]: {
    env: "JEV_MEMORY_EVIDENCE_ON_FAILURE",
    fallback: JevOnFailure.CLOSED,
  },
} as const;

export type JevFailurePolicyCheckpoint = keyof typeof ON_FAILURE_POLICY;

const ON_FAILURE_VALUES = new Set<string>(Object.values(JevOnFailure));

export function getJevOnFailure(
  checkpoint: JevFailurePolicyCheckpoint,
): JevOnFailureValue {
  const { env, fallback } = ON_FAILURE_POLICY[checkpoint];
  const raw = process.env[env]?.trim().toLowerCase();
  return raw && ON_FAILURE_VALUES.has(raw)
    ? (raw as JevOnFailureValue)
    : fallback;
}
