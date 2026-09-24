import { AIMessage, type BaseMessage } from "@langchain/core/messages";
import type { StreamWriter } from "@/lib/chat/safeStream";
import { logWarn } from "@/lib/observability";
import { abortAware } from "./abortAware";
import { GraphNode, RECURSION_LIMIT, RecoveryReason } from "./constants";
import type { createFinalAnswerNode } from "./nodes/agent";
import { extractText } from "./nodes/planner";
import { buildRecoveryMessage } from "./nodes/reflector";
import type { AgentStateType } from "./state";
import type { createStreamEventMapper } from "./streaming";

export const GRAPH_RUN_LIMITS = { recursionLimit: RECURSION_LIMIT } as const;

type ThreadConfig = { configurable: { thread_id: string } };

interface StepLimitGraph {
  getState(config: ThreadConfig): Promise<{ values?: Partial<AgentStateType> }>;
  updateState(
    config: ThreadConfig,
    values: { messages: BaseMessage[] },
    asNode: string,
  ): Promise<unknown>;
}

export function isGraphRecursionError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    (error as { lc_error_code?: string }).lc_error_code === "GRAPH_RECURSION_LIMIT" ||
    error.name === "GraphRecursionError" ||
    /recursion limit/i.test(error.message ?? "")
  );
}

export async function closeTurnAtStepLimit(
  graph: StepLimitGraph,
  finalAnswer: ReturnType<typeof createFinalAnswerNode>,
  threadId: string,
  writer: StreamWriter,
  mapper: ReturnType<typeof createStreamEventMapper>,
  signal: AbortSignal,
  context: Record<string, unknown>,
): Promise<void> {
  logWarn({ event: "orchestrator_step_limit_closed", threadId, ...context });
  const config = { configurable: { thread_id: threadId } };
  const state = await abortAware(graph.getState(config), signal).catch((error) => {
    if (signal.aborted) throw error;
    return { values: undefined };
  });
  const [answer] = state.values?.messages?.length
    ? (await finalAnswer(state.values as AgentStateType, { signal }, RecoveryReason.STEP_LIMIT)).messages
    : [new AIMessage({ content: buildRecoveryMessage([], RecoveryReason.STEP_LIMIT) })];
  try {
    await abortAware(graph.updateState(config, { messages: [answer] }, GraphNode.RECOVERY), signal);
  } catch (error) {
    if (signal.aborted) throw error;
    logWarn({
      event: "orchestrator_step_limit_checkpoint_failed",
      threadId,
      error: error instanceof Error ? error.name : "unknown",
      ...context,
    });
  }
  mapper.appendAnswer(writer, extractText(answer.content));
}
