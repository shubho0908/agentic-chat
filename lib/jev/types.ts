import { z } from "zod";

export const JevCheckpoint = {
  CACHE_GATE: "cache_gate",
  RERANK: "rerank",
  PASSAGE_GATE: "passage_gate",
  PLANNER: "planner",
  TOOL_ROUTER: "tool_router",
  HITL_ESCALATION: "hitl_escalation",
  MEMORY_GATE: "memory_gate",
  MEMORY_EVIDENCE: "memory_evidence",
  MEMORY_STORAGE: "memory_storage",
} as const;
export type JevCheckpointName = (typeof JevCheckpoint)[keyof typeof JevCheckpoint];

export const JevMode = {
  OFF: "off",
  SHADOW: "shadow",
  AB: "ab",
  ACTIVE: "active",
} as const;
export type JevModeValue = (typeof JevMode)[keyof typeof JevMode];

export const JevFallbackReason = {
  TIMEOUT: "timeout",
  ERROR: "error",
  INVALID: "invalid",
  LOW_CONFIDENCE: "low_confidence",
  CIRCUIT_OPEN: "circuit_open",
} as const;
type JevFallbackReasonValue =
  (typeof JevFallbackReason)[keyof typeof JevFallbackReason];

const probabilitySchema = z.number().min(0).max(1);

interface JevNoulQuestion {
  type: "noul";
  instructions: string;
  criteria?: { true: string; false: string };
}

interface JevChoiceQuestion {
  type: "choice";
  instructions: string;
  criteria: Record<string, string>;
}

interface JevScoreQuestion {
  type: "score";
  instructions: string;
  criteria: string[];
}

type JevQuestion = JevNoulQuestion | JevChoiceQuestion | JevScoreQuestion;
export type JevQuestions = Record<string, JevQuestion>;

const jevNoulAnswerSchema = z.object({
  type: z.literal("noul"),
  noul: probabilitySchema,
});

const jevChoiceAnswerSchema = z.object({
  type: z.literal("choice"),
  choice: z.string().min(1),
  confidence: probabilitySchema.optional(),
  probabilities: z.record(z.string(), probabilitySchema).optional(),
});

const jevScoreAnswerSchema = z.object({
  type: z.literal("score"),
  score: z.number().finite(),
  confidence: probabilitySchema.optional(),
  legend: z.record(z.string(), z.string()).optional(),
  probabilities: z.record(z.string(), probabilitySchema).optional(),
});

const jevAnswerSchema = z.discriminatedUnion("type", [
  jevNoulAnswerSchema,
  jevChoiceAnswerSchema,
  jevScoreAnswerSchema,
]);

const jevUsageSchema = z.object({
  input_tokens: z.number().int().nonnegative().optional(),
  output_tokens: z.number().int().nonnegative().optional(),
});

export const jevRawResponseSchema = z.object({
  model: z.string().optional(),
  answers: z.record(z.string(), jevAnswerSchema),
  usage: jevUsageSchema.optional(),
});

type JevAnswer = z.infer<typeof jevAnswerSchema>;
export type JevAnswers = Record<string, JevAnswer>;
export type JevUsage = z.infer<typeof jevUsageSchema>;

interface JevTraceContext {
  requestId: string;
  conversationId?: string;
}

export interface JevEvaluateInput {
  checkpoint: JevCheckpointName;
  schemaVersion: string;
  state: unknown;
  questions: JevQuestions;
  timeoutMs: number;
  traceContext: JevTraceContext;
  /** Caller-side cancellation (e.g. a sibling fan-out call already failed).
   * A call cancelled this way is not a provider failure: it does not count
   * against the circuit breaker. */
  signal?: AbortSignal;
}

/** Redacted envelope for shadow evaluation. Never carries raw state content. */
export interface JevDecisionRecord {
  checkpoint: JevCheckpointName;
  schemaVersion: string;
  modelVersion: string;
  mode: JevModeValue;
  latencyMs: number;
  outcome: string;
  probabilities?: Record<string, number>;
  confidence?: number;
  fallbackUsed: boolean;
  fallbackReason?: JevFallbackReasonValue;
  inputTokens?: number;
  outputTokens?: number;
  requestId?: string;
  conversationId?: string;
}
