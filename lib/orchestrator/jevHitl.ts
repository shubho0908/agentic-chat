import { createHash } from "node:crypto";
import { isDangerousAction } from "@/lib/tools/composio/config";
import { ToolName } from "@/lib/tools/constants";
import { createRequestId, logWarn } from "@/lib/observability";
import { logger } from "@/lib/logger";
import { JevDecisionClient, classifyJevFailure } from "@/lib/jev/client";
import { getJevMode } from "@/lib/jev/config";
import { logJevDecision } from "@/lib/jev/telemetry";
import {
  JevCheckpoint,
  JevFallbackReason,
  JevMode,
  type JevModeValue,
} from "@/lib/jev/types";
import {
  evaluateHitlEscalationWithJev,
  mapJevHitlEscalationResult,
  shouldJevEscalate,
  type JevHitlEscalationDecision,
  type JevHitlEscalationState,
} from "@/lib/jev/hitlEscalation";
import { previewToolArgs } from "@/lib/jev/toolRouter";

interface JevHitlToolCall {
  name?: string;
  args?: unknown;
}

export interface JevHitlEscalationVerdict {
  signature: string;
  escalate: boolean;
}

const JEV_HITL_MAX_TOOL_CALLS = 10;

const jevClient = JevDecisionClient.createIfConfigured();

function buildJevHitlState(
  toolCalls: JevHitlToolCall[],
  deterministicEscalated: boolean,
): JevHitlEscalationState {
  return {
    toolCalls: toolCalls.slice(0, JEV_HITL_MAX_TOOL_CALLS).map((tc) => ({
      name: typeof tc.name === "string" && tc.name ? tc.name : "tool",
      argsPreview: previewToolArgs(tc.args),
    })),
    deterministicEscalated,
  };
}

/** Stable identity of one round's tool-call set. The verdict lives in graph
 * state so an interrupt resume re-derives the SAME branch without a second
 * provider call: hashed, because raw args would bloat the checkpoint. */
export function jevHitlSignature(toolCalls: JevHitlToolCall[]): string {
  const payload = toolCalls.map((tc) => {
    let args: string;
    try {
      args = JSON.stringify(tc.args ?? null) ?? "null";
    } catch {
      args = "unserializable";
    }
    return { name: tc.name ?? "tool", args };
  });
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function logHitlRecord(
  mode: JevModeValue,
  outcome: string,
  options: {
    modelVersion: string;
    latencyMs: number;
    decision?: JevHitlEscalationDecision | null;
    fallbackUsed: boolean;
    fallbackReason?: (typeof JevFallbackReason)[keyof typeof JevFallbackReason];
    requestId: string;
    conversationId?: string;
    inputTokens?: number;
    outputTokens?: number;
  },
): void {
  logJevDecision({
    checkpoint: JevCheckpoint.HITL_ESCALATION,
    schemaVersion: "1.0.0",
    modelVersion: options.modelVersion,
    mode,
    latencyMs: options.latencyMs,
    outcome,
    probabilities: options.decision
      ? {
          needsHumanReview: options.decision.needsHumanReview,
          irreversibleOrExternal: options.decision.irreversibleOrExternal,
        }
      : undefined,
    fallbackUsed: options.fallbackUsed,
    fallbackReason: options.fallbackReason,
    inputTokens: options.inputTokens,
    outputTokens: options.outputTokens,
    requestId: options.requestId,
    conversationId: options.conversationId,
  });
}

/** Observe-only comparison of Jev's escalation verdict against the
 * deterministic blocklist decision. Never throws, never changes the flow. */
async function runJevHitlShadow(
  state: JevHitlEscalationState,
  conversationId: string | undefined,
  mode: JevModeValue,
): Promise<void> {
  if (!jevClient) return;
  const requestId = createRequestId("jev_hitl_escalation");
  const startedAt = Date.now();
  try {
    const result = await evaluateHitlEscalationWithJev(jevClient, state, {
      requestId,
      conversationId,
    });
    const decision = mapJevHitlEscalationResult(result);
    if (!decision) {
      logWarn({
        event: "jev_hitl_invalid_response",
        message: "Jev HITL escalation response failed checkpoint mapping",
        ...(result.rawBody && { responseBody: result.rawBody }),
        requestId,
        conversationId,
      });
      logHitlRecord(mode, "invalid_response", {
        modelVersion: result.modelVersion,
        latencyMs: Date.now() - startedAt,
        fallbackUsed: true,
        fallbackReason: JevFallbackReason.INVALID,
        requestId,
        conversationId,
      });
      return;
    }
    const jevEscalates = shouldJevEscalate(decision);
    logHitlRecord(
      mode,
      jevEscalates
        ? state.deterministicEscalated
          ? "agree_escalate"
          : "jev_would_escalate"
        : state.deterministicEscalated
          ? "jev_would_not_escalate"
          : "agree_proceed",
      {
        modelVersion: result.modelVersion,
        latencyMs: result.latencyMs,
        decision,
        fallbackUsed: false,
        inputTokens: result.usage?.input_tokens,
        outputTokens: result.usage?.output_tokens,
        requestId,
        conversationId,
      },
    );
  } catch (error) {
    logHitlRecord(mode, "error", {
      modelVersion: "unknown",
      latencyMs: Date.now() - startedAt,
      fallbackUsed: true,
      fallbackReason: classifyJevFailure(error),
      requestId,
      conversationId,
    });
  }
}

/** Fire-and-forget wrapper: shadow observation is queued, never awaited,
 * and every failure path is swallowed into telemetry. */
function queueJevHitlShadow(
  state: JevHitlEscalationState,
  conversationId: string | undefined,
  mode: JevModeValue,
): void {
  try {
    void runJevHitlShadow(state, conversationId, mode).catch((error) =>
      logger.warn("[JevHitl] Shadow evaluation failed:", error),
    );
  } catch (error) {
    logger.warn("[JevHitl] Shadow evaluation failed:", error);
  }
}

/** Active-mode verdict. Additive only: consulted solely when the
 * deterministic blocklist stayed quiet, and every failure fails open to the
 * deterministic decision (no added escalation). */
async function evaluateJevHitlActive(
  state: JevHitlEscalationState,
  conversationId: string | undefined,
): Promise<boolean> {
  if (!jevClient) return false;
  const requestId = createRequestId("jev_hitl_escalation");
  const startedAt = Date.now();
  try {
    const result = await evaluateHitlEscalationWithJev(jevClient, state, {
      requestId,
      conversationId,
    });
    const decision = mapJevHitlEscalationResult(result);
    if (!decision) {
      logWarn({
        event: "jev_hitl_invalid_response",
        message:
          "Jev HITL escalation response failed checkpoint mapping; proceeding without added review",
        ...(result.rawBody && { responseBody: result.rawBody }),
        requestId,
        conversationId,
      });
      logHitlRecord(JevMode.ACTIVE, "invalid_response_proceed", {
        modelVersion: result.modelVersion,
        latencyMs: Date.now() - startedAt,
        fallbackUsed: true,
        fallbackReason: JevFallbackReason.INVALID,
        requestId,
        conversationId,
      });
      return false;
    }
    const escalate = shouldJevEscalate(decision);
    logHitlRecord(JevMode.ACTIVE, escalate ? "escalate_added" : "proceed", {
      modelVersion: result.modelVersion,
      latencyMs: result.latencyMs,
      decision,
      fallbackUsed: false,
      inputTokens: result.usage?.input_tokens,
      outputTokens: result.usage?.output_tokens,
      requestId,
      conversationId,
    });
    return escalate;
  } catch (error) {
    logHitlRecord(JevMode.ACTIVE, "error_proceed", {
      modelVersion: "unknown",
      latencyMs: Date.now() - startedAt,
      fallbackUsed: true,
      fallbackReason: classifyJevFailure(error),
      requestId,
      conversationId,
    });
    return false;
  }
}

/** Agent-node entry point, run after the model emits tool calls and before
 * the tools node. Shadow/ab only observe; active can ADD human review when
 * the deterministic blocklist stayed quiet. The verdict is keyed by the
 * tool-call signature so the tools node replays the identical branch across
 * an interrupt resume. Jev can never suppress a deterministic escalation. */
export async function resolveJevHitlVerdict(
  toolCalls: JevHitlToolCall[],
  conversationId: string | undefined,
): Promise<JevHitlEscalationVerdict | null> {
  const mode = getJevMode(JevCheckpoint.HITL_ESCALATION);
  const evaluatedCalls = toolCalls.filter((tc) => tc.name !== ToolName.CREATE_PDF);
  if (mode === JevMode.OFF || !jevClient || evaluatedCalls.length === 0) {
    return null;
  }
  const deterministicEscalated = evaluatedCalls.some(
    (tc) => typeof tc.name === "string" && isDangerousAction(tc.name),
  );
  const state = buildJevHitlState(evaluatedCalls, deterministicEscalated);
  if (mode !== JevMode.ACTIVE || deterministicEscalated) {
    queueJevHitlShadow(state, conversationId, mode);
    return null;
  }
  const escalate = await evaluateJevHitlActive(state, conversationId);
  return { signature: jevHitlSignature(toolCalls), escalate };
}
