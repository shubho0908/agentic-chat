import {
  JevCheckpoint,
  JevMode,
  type JevCheckpointName,
  type JevModeValue,
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
  [JevCheckpoint.UNTRUSTED_CONTENT]: "JEV_UNTRUSTED_CONTENT_MODE",
  [JevCheckpoint.OUTPUT_DLP]: "JEV_OUTPUT_DLP_MODE",
};

const MODE_VALUES = new Set<string>(Object.values(JevMode));

export function getJevMode(checkpoint: JevCheckpointName): JevModeValue {
  const raw = process.env[ENV_BY_CHECKPOINT[checkpoint]]?.trim().toLowerCase();
  return raw && MODE_VALUES.has(raw) ? (raw as JevModeValue) : JevMode.OFF;
}

export function isJevEnabled(checkpoint: JevCheckpointName): boolean {
  return getJevMode(checkpoint) !== JevMode.OFF;
}
