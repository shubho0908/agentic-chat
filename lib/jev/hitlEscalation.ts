import { JevCheckpoint, type JevQuestions } from "./types";
import type { JevDecisionClient, JevEvaluateResult } from "./client";

const JEV_HITL_ESCALATION_SCHEMA_VERSION = "1.0.0";
// Active mode awaits this verdict before tools run, so the budget matches
// the tool-diagnosis bound: cold starts fail open to the deterministic path.
const JEV_HITL_ESCALATION_TIMEOUT_MS = 2_000;
// Jev may only ADD human review, so the bar sits well above the 0.5 used by
// filter-style gates: interrupt fatigue is the failure mode being avoided.
export const JEV_HITL_ESCALATE_THRESHOLD = 0.8;
export const JEV_HITL_IRREVERSIBLE_THRESHOLD = 0.5;

/** Tool names plus type-only argument previews (see previewToolArgs): the
 * external evaluation API sees the shape of the pending calls, never user
 * content. */
export interface JevHitlEscalationState {
  toolCalls: Array<{ name: string; argsPreview: string }>;
  deterministicEscalated: boolean;
}

export interface JevHitlEscalationDecision {
  needsHumanReview: number;
  irreversibleOrExternal: number;
}

const JEV_HITL_ESCALATION_QUESTIONS: JevQuestions = {
  needs_human_review: {
    type: "noul",
    instructions:
      "Should a human review these tool calls before they execute?",
    criteria: {
      true: "At least one call sends, creates, deletes, shares, or otherwise changes something the user would want to approve first.",
      false: "Every call is read-only or trivially reversible, so review would only add friction.",
    },
  },
  irreversible_or_external: {
    type: "noul",
    instructions:
      "Could any of these calls cause effects outside this app that are hard to undo?",
    criteria: {
      true: "A call could send a message, spend money, publish, delete, or modify something in an external account.",
      false: "All effects stay local and reversible.",
    },
  },
};

/** Returns null when any answer is missing or mistyped; callers treat null
 * as invalid and keep the deterministic decision. */
export function mapJevHitlEscalationResult(
  result: JevEvaluateResult,
): JevHitlEscalationDecision | null {
  const reviewAnswer = result.answers.needs_human_review;
  const irreversibleAnswer = result.answers.irreversible_or_external;
  if (reviewAnswer?.type !== "noul") return null;
  if (irreversibleAnswer?.type !== "noul") return null;
  return {
    needsHumanReview: reviewAnswer.noul,
    irreversibleOrExternal: irreversibleAnswer.noul,
  };
}

/** Adding an interrupt needs a confident review verdict backed by real
 * downside. Jev can never suppress a deterministic escalation - this
 * function is only consulted when the blocklist stayed quiet. */
export function shouldJevEscalate(decision: JevHitlEscalationDecision): boolean {
  return (
    decision.needsHumanReview >= JEV_HITL_ESCALATE_THRESHOLD &&
    decision.irreversibleOrExternal >= JEV_HITL_IRREVERSIBLE_THRESHOLD
  );
}

export async function evaluateHitlEscalationWithJev(
  client: JevDecisionClient,
  state: JevHitlEscalationState,
  traceContext: { requestId: string; conversationId?: string },
): Promise<JevEvaluateResult> {
  return client.evaluate({
    checkpoint: JevCheckpoint.HITL_ESCALATION,
    schemaVersion: JEV_HITL_ESCALATION_SCHEMA_VERSION,
    state,
    questions: JEV_HITL_ESCALATION_QUESTIONS,
    timeoutMs: JEV_HITL_ESCALATION_TIMEOUT_MS,
    traceContext,
  });
}
