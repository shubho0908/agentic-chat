import { z } from "zod";
import { JevCheckpoint, type JevQuestions } from "./types";
import type { JevDecisionClient, JevEvaluateResult } from "./client";

export const JEV_TOOL_ROUTER_SCHEMA_VERSION = "1.0.0";
// Shadow runs in background with zero user impact, so the budget covers
// cold starts (measured live p50 ~0.4s, cold ~1.5-4.4s).
export const JEV_TOOL_ROUTER_TIMEOUT_MS = 10_000;
// Bounded wait on failure rounds only. Covers the warm p50; cold starts
// miss by design and keep the deterministic envelope.
export const JEV_TOOL_DIAGNOSIS_TIMEOUT_MS = 2_000;
export const JEV_TOOL_ROUTER_MAX_CONTENT_CHARS = 500;
export const JEV_TOOL_ROUTER_MAX_TOOL_NAMES = 8;

export interface JevToolRouterState {
  roundNumber: number;
  maxRounds: number;
  recentToolNames: string[];
  latestMessage: string;
}

export interface JevToolRouterDecision {
  route: "tools" | "end";
  routeConfidence?: number;
  routeProbabilities?: Record<string, number>;
  needsMoreWork: number;
  loopRisk: number;
}

/** Diagnosis preview that can never carry user content: argument keys are
 * kept, every value is replaced by its type (strings by length only). Tool
 * args for email, messaging, docs and sheets hold user-provided content, so
 * the external diagnosis API gets the shape of the call, never the payload. */
function previewValue(value: unknown, depth: number): unknown {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return `array(${value.length})`;
  switch (typeof value) {
    case "string":
      return `string(${value.length})`;
    case "number":
    case "boolean":
      return typeof value;
    case "object": {
      if (depth >= 2) return "object";
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, v]) => [
          key,
          previewValue(v, depth + 1),
        ]),
      );
    }
    default:
      return typeof value;
  }
}

export function previewToolArgs(args: unknown): string {
  try {
    return (JSON.stringify(previewValue(args, 0)) ?? "null").slice(0, 200);
  } catch {
    return "unserializable";
  }
}

export interface JevToolDiagnosisState {
  toolName: string;
  argsPreview: string;
  failureKind: string;
  identicalFailureCount: number;
}

export interface JevToolDiagnosis {
  retryWorthwhile: number;
  fixDirection: "retry_same" | "fix_args" | "abandon";
}

export const JEV_TOOL_ROUTER_QUESTIONS: JevQuestions = {
  route: {
    type: "choice",
    instructions:
      "Should the agent loop back to tools or finish and answer the user?",
    criteria: {
      tools: "More tool calls are needed before a good answer is possible.",
      end: "Enough is known to answer, or further calls would repeat work.",
    },
  },
  needs_more_tool_work: {
    type: "noul",
    instructions: "Does the task still need tool calls to complete?",
    criteria: {
      true: "Key facts are missing that only a tool call can supply.",
      false: "The collected results already cover the request.",
    },
  },
  at_risk_of_loop: {
    type: "noul",
    instructions: "Is the trajectory stuck repeating itself?",
    criteria: {
      true: "The same calls recur without new information.",
      false: "Each round advances the task or explores new ground.",
    },
  },
};

export const JEV_TOOL_DIAGNOSIS_QUESTIONS: JevQuestions = {
  retry_worthwhile: {
    type: "noul",
    instructions: "Would retrying this failed tool call likely succeed?",
    criteria: {
      true: "The failure looks transient or fixable with the same call.",
      false: "The failure looks permanent or structural.",
    },
  },
  fix_direction: {
    type: "choice",
    instructions: "What should the agent do about this failure?",
    criteria: {
      retry_same: "Run the identical call once more.",
      fix_args: "Correct the arguments before retrying.",
      abandon: "Drop this call and proceed another way.",
    },
  },
};

const routeSchema = z.enum(["tools", "end"]);
const fixDirectionSchema = z.enum(["retry_same", "fix_args", "abandon"]);

/** Returns null when any answer is missing, mistyped, or outside the
 * closed option sets; callers treat null as invalid and keep production. */
export function mapJevToolRouterResult(
  result: JevEvaluateResult,
): JevToolRouterDecision | null {
  const routeAnswer = result.answers.route;
  const workAnswer = result.answers.needs_more_tool_work;
  const loopAnswer = result.answers.at_risk_of_loop;

  if (routeAnswer?.type !== "choice") return null;
  if (workAnswer?.type !== "noul") return null;
  if (loopAnswer?.type !== "noul") return null;

  const route = routeSchema.safeParse(routeAnswer.choice);
  if (!route.success) return null;

  return {
    route: route.data,
    routeConfidence: routeAnswer.confidence,
    routeProbabilities: routeAnswer.probabilities,
    needsMoreWork: workAnswer.noul,
    loopRisk: loopAnswer.noul,
  };
}

/** Advisory only: structured fields the caller renders through a fixed
 * template. Raw model text never reaches the prompt. */
export function mapJevDiagnosisResult(
  result: JevEvaluateResult,
): JevToolDiagnosis | null {
  const retryAnswer = result.answers.retry_worthwhile;
  const fixAnswer = result.answers.fix_direction;

  if (retryAnswer?.type !== "noul") return null;
  if (fixAnswer?.type !== "choice") return null;

  const fixDirection = fixDirectionSchema.safeParse(fixAnswer.choice);
  if (!fixDirection.success) return null;

  return {
    retryWorthwhile: retryAnswer.noul,
    fixDirection: fixDirection.data,
  };
}

export async function evaluateToolRouterWithJev(
  client: JevDecisionClient,
  state: JevToolRouterState,
  traceContext: { requestId: string; conversationId?: string },
): Promise<JevEvaluateResult> {
  return client.evaluate({
    checkpoint: JevCheckpoint.TOOL_ROUTER,
    schemaVersion: JEV_TOOL_ROUTER_SCHEMA_VERSION,
    state,
    questions: JEV_TOOL_ROUTER_QUESTIONS,
    timeoutMs: JEV_TOOL_ROUTER_TIMEOUT_MS,
    traceContext,
  });
}

export async function evaluateToolDiagnosisWithJev(
  client: JevDecisionClient,
  state: JevToolDiagnosisState,
  traceContext: { requestId: string; conversationId?: string },
): Promise<JevEvaluateResult> {
  return client.evaluate({
    checkpoint: JevCheckpoint.TOOL_ROUTER,
    schemaVersion: JEV_TOOL_ROUTER_SCHEMA_VERSION,
    state,
    questions: JEV_TOOL_DIAGNOSIS_QUESTIONS,
    timeoutMs: JEV_TOOL_DIAGNOSIS_TIMEOUT_MS,
    traceContext,
  });
}
