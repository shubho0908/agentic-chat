export const HUMAN_IN_THE_LOOP_APPROVED = "approved" as const;
export const HUMAN_IN_THE_LOOP_DENIED = "denied" as const;
export const HUMAN_IN_THE_LOOP_REQUEST_TYPE = "hitl_request" as const;
export const TOOL_ERROR_STATUS = "error" as const;

export const MAX_TOOLS = 128;
export const MAX_TOOL_ROUNDS = 20;
export const RECURSION_LIMIT = 2 * MAX_TOOL_ROUNDS + 10;
export const MAX_RESPONSE_TOKENS = 16384;
export const MIN_CACHEABLE_QUERY_LENGTH = 80;

/**
 * Hard deadline for one orchestrator stream, aligned under this route's Vercel
 * maxDuration (300s) so the handler can abort work and emit a terminal SSE
 * error before the platform hard-kills the invocation.
 */
export const ORCHESTRATOR_STREAM_DEADLINE_MS = 285_000;

export const FINAL_ANSWER_RESERVE_MS = 45_000;

export const MIN_TURN_WORK_MS = 15_000;

/**
 * Fail-fast lock wait for approvals: they are interactive, and a held lease
 * means another response is actively generating, so surface that as a
 * client-visible conflict quickly instead of parking the caller for the full
 * chat window. Stays well under ORCHESTRATOR_STREAM_DEADLINE_MS so the answer
 * always lands before the platform hard kill.
 */
export const APPROVAL_LOCK_WAIT_TIMEOUT_MS = 60_000;

/**
 * SSE comment cadence proving stream liveness during long model/tool silences;
 * the client stall watchdog keys off any inbound bytes, including these.
 */
export const STREAM_HEARTBEAT_INTERVAL_MS = 15_000;

/**
 * Per-attempt ceiling for the agent node's ChatOpenAI call. The SDK default
 * (~600s) exceeds the route's maxDuration (300s), so a hung model call used to
 * be killed by the platform with no client-visible error. With 2 retries the
 * worst case stays bounded by ORCHESTRATOR_STREAM_DEADLINE_MS via the request
 * abort signal.
 */
export const AGENT_LLM_TIMEOUT_MS = 180_000;

export const GraphNode = {
  PLANNER: "planner",
  AGENT: "agent",
  TOOLS: "tools",
  RECOVERY: "recovery",
} as const;

export const RecoveryReason = {
  ROUND_LIMIT: "round_limit",
  TOOL_FAILURES: "tool_failures",
  EMPTY_ANSWER: "empty_answer",
  STEP_LIMIT: "step_limit",
  TIME_LIMIT: "time_limit",
} as const;
export type RecoveryReasonValue =
  (typeof RecoveryReason)[keyof typeof RecoveryReason];

export const PlanComplexity = {
  DIRECT: "direct",
  TOOL_NEEDED: "tool_needed",
  MULTI_STEP: "multi_step",
} as const;
export type PlanComplexityValue =
  (typeof PlanComplexity)[keyof typeof PlanComplexity];

export const CustomEventName = {
  THINKING: "thinking",
  PLANNING: "planning",
  RESEARCH_PROGRESS: "research_progress",
  SEARCH_IMAGES: "search_images",
  SEARCH_SOURCES: "search_sources",
  PDF_FILE: "pdf_file",
} as const;

export const StreamEventType = {
  CHAIN_START: "on_chain_start",
  CHAIN_END: "on_chain_end",
  CHAT_MODEL_STREAM: "on_chat_model_stream",
  CHAT_MODEL_END: "on_chat_model_end",
  TOOL_START: "on_tool_start",
  TOOL_END: "on_tool_end",
  CUSTOM_EVENT: "on_custom_event",
} as const;

export const ToolStatus = {
  RUNNING: "running",
  COMPLETED: "completed",
} as const;
