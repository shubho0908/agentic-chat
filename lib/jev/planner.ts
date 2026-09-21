import { z } from "zod";
import { PlanComplexity, type PlanComplexityValue } from "@/lib/orchestrator/constants";
import { JevCheckpoint, type JevQuestions } from "./types";
import type { JevDecisionClient, JevEvaluateResult } from "./client";

const JEV_PLANNER_SCHEMA_VERSION = "1.0.0";
const JEV_PLANNER_TIMEOUT_MS = 2_000;

export interface JevPlannerState {
  latestMessage: string;
  conversationTail: Array<{ role: "user" | "assistant"; content: string }>;
  connectedToolkits: string[];
}

export interface JevPlannerDecision {
  complexity: PlanComplexityValue;
  complexityConfidence?: number;
  complexityProbabilities?: Record<string, number>;
  needsExternalData: number;
  needsClarification: number;
}

const JEV_PLANNER_QUESTIONS: JevQuestions = {
  complexity: {
    type: "choice",
    instructions: "Classify how the user's latest request should be executed.",
    criteria: {
      [PlanComplexity.DIRECT]: "No external lookup or action is needed.",
      [PlanComplexity.TOOL_NEEDED]: "One external lookup or action is needed.",
      [PlanComplexity.MULTI_STEP]: "Several dependent lookups or actions are needed.",
    },
  },
  needs_external_data: {
    type: "noul",
    instructions:
      "Does the request require current, changing, or account-specific external data?",
    criteria: {
      true: "Answering needs live data, the user's connected accounts, or the web.",
      false: "The request can be answered from the conversation and general knowledge.",
    },
  },
  needs_clarification: {
    type: "noul",
    instructions: "Is a user decision required before safe execution can continue?",
    criteria: {
      true: "The request is ambiguous enough that acting without asking risks doing the wrong thing.",
      false: "The intent is clear enough to proceed.",
    },
  },
};

const planComplexitySchema = z.enum([
  PlanComplexity.DIRECT,
  PlanComplexity.TOOL_NEEDED,
  PlanComplexity.MULTI_STEP,
]);
/** Returns null when any answer is missing, mistyped, or the complexity is
 * outside PlanComplexity; callers treat null as invalid and keep the current
 * planner decision. */
export function mapJevPlannerResult(
  result: JevEvaluateResult,
): JevPlannerDecision | null {
  const complexityAnswer = result.answers.complexity;
  const externalAnswer = result.answers.needs_external_data;
  const clarificationAnswer = result.answers.needs_clarification;

  if (complexityAnswer?.type !== "choice") return null;
  if (externalAnswer?.type !== "noul") return null;
  if (clarificationAnswer?.type !== "noul") return null;

  const complexity = planComplexitySchema.safeParse(complexityAnswer.choice);
  if (!complexity.success) return null;

  return {
    complexity: complexity.data,
    complexityConfidence: complexityAnswer.confidence,
    complexityProbabilities: complexityAnswer.probabilities,
    needsExternalData: externalAnswer.noul,
    needsClarification: clarificationAnswer.noul,
  };
}

export async function evaluatePlannerWithJev(
  client: JevDecisionClient,
  state: JevPlannerState,
  traceContext: { requestId: string; conversationId?: string },
): Promise<JevEvaluateResult> {
  return client.evaluate({
    checkpoint: JevCheckpoint.PLANNER,
    schemaVersion: JEV_PLANNER_SCHEMA_VERSION,
    state,
    questions: JEV_PLANNER_QUESTIONS,
    timeoutMs: JEV_PLANNER_TIMEOUT_MS,
    traceContext,
  });
}

