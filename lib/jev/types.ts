import { z } from "zod";

export const JevCheckpoint = {
  CACHE_GATE: "cache_gate",
  RERANK: "rerank",
  PASSAGE_GATE: "passage_gate",
  PLANNER: "planner",
  TOOL_ROUTER: "tool_router",
  HITL_ESCALATION: "hitl_escalation",
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
export type JevFallbackReasonValue =
  (typeof JevFallbackReason)[keyof typeof JevFallbackReason];

const probabilitySchema = z.number().min(0).max(1);

export const jevNoulQuestionSchema = z.object({
  type: z.literal("noul"),
  instructions: z.string().min(1),
  criteria: z
    .object({ true: z.string().min(1), false: z.string().min(1) })
    .optional(),
});

export const jevChoiceQuestionSchema = z.object({
  type: z.literal("choice"),
  instructions: z.string().min(1),
  criteria: z.record(z.string().min(1), z.string().min(1)),
});

export const jevScoreQuestionSchema = z.object({
  type: z.literal("score"),
  instructions: z.string().min(1),
  criteria: z.array(z.string().min(1)).min(2),
});

export const jevQuestionSchema = z.discriminatedUnion("type", [
  jevNoulQuestionSchema,
  jevChoiceQuestionSchema,
  jevScoreQuestionSchema,
]);

export type JevNoulQuestion = z.infer<typeof jevNoulQuestionSchema>;
export type JevChoiceQuestion = z.infer<typeof jevChoiceQuestionSchema>;
export type JevScoreQuestion = z.infer<typeof jevScoreQuestionSchema>;
export type JevQuestion = z.infer<typeof jevQuestionSchema>;
export type JevQuestions = Record<string, JevQuestion>;

export const jevNoulAnswerSchema = z.object({
  type: z.literal("noul"),
  noul: probabilitySchema,
});

export const jevChoiceAnswerSchema = z.object({
  type: z.literal("choice"),
  choice: z.string().min(1),
  confidence: probabilitySchema.optional(),
  probabilities: z.record(z.string(), probabilitySchema).optional(),
});

export const jevScoreAnswerSchema = z.object({
  type: z.literal("score"),
  score: z.number().finite(),
  confidence: probabilitySchema.optional(),
  legend: z.record(z.string(), z.string()).optional(),
  probabilities: z.record(z.string(), probabilitySchema).optional(),
});

export const jevAnswerSchema = z.discriminatedUnion("type", [
  jevNoulAnswerSchema,
  jevChoiceAnswerSchema,
  jevScoreAnswerSchema,
]);

export const jevUsageSchema = z.object({
  input_tokens: z.number().int().nonnegative().optional(),
  output_tokens: z.number().int().nonnegative().optional(),
});

export const jevRawResponseSchema = z.object({
  model: z.string().optional(),
  answers: z.record(z.string(), jevAnswerSchema),
  usage: jevUsageSchema.optional(),
});

export type JevNoulAnswer = z.infer<typeof jevNoulAnswerSchema>;
export type JevChoiceAnswer = z.infer<typeof jevChoiceAnswerSchema>;
export type JevScoreAnswer = z.infer<typeof jevScoreAnswerSchema>;
export type JevAnswer = z.infer<typeof jevAnswerSchema>;
export type JevAnswers = Record<string, JevAnswer>;
export type JevUsage = z.infer<typeof jevUsageSchema>;
export type JevRawResponse = z.infer<typeof jevRawResponseSchema>;

export const JevProvider = {
  TYPESAFE: "typesafe",
  CLOUDFLARE: "cloudflare",
} as const;
export type JevProviderName = (typeof JevProvider)[keyof typeof JevProvider];

export interface JevTraceContext {
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
