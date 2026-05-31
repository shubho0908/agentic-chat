export const HUMAN_IN_THE_LOOP_APPROVED = "approved" as const;
export const HUMAN_IN_THE_LOOP_DENIED = "denied" as const;
export const HUMAN_IN_THE_LOOP_REQUEST_TYPE = "hitl_request" as const;
export const TOOL_ERROR_STATUS = "error" as const;

export const MAX_TOOLS = 128;
export const RECURSION_LIMIT = 25;
export const MAX_RESPONSE_TOKENS = 16384;
export const MAX_TOOL_ITERATIONS = 6;
export const MIN_CACHEABLE_QUERY_LENGTH = 80;

export const GraphNode = {
  PLANNER: "planner",
  AGENT: "agent",
  TOOLS: "tools",
} as const;

export const PlanComplexity = {
  DIRECT: "direct",
  TOOL_NEEDED: "tool_needed",
  MULTI_STEP: "multi_step",
} as const;
export type PlanComplexityValue = (typeof PlanComplexity)[keyof typeof PlanComplexity];

export const CustomEventName = {
  THINKING: "thinking",
  PLANNING: "planning",
} as const;

export const StreamEventType = {
  CHAT_MODEL_STREAM: "on_chat_model_stream",
  TOOL_START: "on_tool_start",
  TOOL_END: "on_tool_end",
  CUSTOM_EVENT: "on_custom_event",
} as const;

export const ToolStatus = {
  RUNNING: "running",
  COMPLETED: "completed",
} as const;
