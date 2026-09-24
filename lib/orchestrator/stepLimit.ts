import { AIMessage, type BaseMessage } from "@langchain/core/messages";
import type { StreamWriter } from "@/lib/chat/safeStream";
import { logWarn } from "@/lib/observability";
import { abortAware } from "./abortAware";
import { GraphNode, RECURSION_LIMIT, RecoveryReason, type RecoveryReasonValue } from "./constants";
import type { createFinalAnswerNode } from "./nodes/agent";
import { extractText } from "./nodes/planner";
import { buildRecoveryMessage } from "./nodes/reflector";
import type { AgentStateType } from "./state";
import type { createStreamEventMapper } from "./streaming";

export const GRAPH_RUN_LIMITS = { recursionLimit: RECURSION_LIMIT } as const;

const CLOSE_MARGIN_MS = 3_000;
const ANSWER_RECHECK_MS = 1_000;

type ThreadConfig = { configurable: { thread_id: string } };

interface LimitGraph {
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

export function createAnswerDue(afterMs: number, isAnswering: () => boolean) {
  const controller = new AbortController();
  if (afterMs <= 0) return { signal: controller.signal, dispose: () => {} };
  const check = () => {
    if (isAnswering()) timer = setTimeout(check, ANSWER_RECHECK_MS);
    else controller.abort(new DOMException("Final answer due", "TimeoutError"));
  };
  let timer = setTimeout(check, afterMs);
  return { signal: controller.signal, dispose: () => clearTimeout(timer) };
}

export function limitReason(error: unknown, answerDue: AbortSignal): RecoveryReasonValue | null {
  if (isGraphRecursionError(error)) return RecoveryReason.STEP_LIMIT;
  return answerDue.aborted ? RecoveryReason.TIME_LIMIT : null;
}

export async function closeTurnAtLimit(
  graph: LimitGraph,
  finalAnswer: ReturnType<typeof createFinalAnswerNode>,
  reason: RecoveryReasonValue,
  threadId: string,
  writer: StreamWriter,
  mapper: ReturnType<typeof createStreamEventMapper>,
  signal: AbortSignal,
  deadlineAt: number,
  context: Record<string, unknown>,
): Promise<void> {
  logWarn({ event: "orchestrator_turn_limit_closed", threadId, reason, ...context });
  const config = { configurable: { thread_id: threadId } };
  const state = await abortAware(graph.getState(config), signal).catch((error) => {
    if (signal.aborted) throw error;
    return { values: undefined };
  });
  const fallback = () => new AIMessage({ content: buildRecoveryMessage(state.values?.messages ?? [], reason) });
  let answer: BaseMessage = fallback();
  if (state.values?.messages?.length) {
    const budget = AbortSignal.timeout(Math.max(0, deadlineAt - Date.now() - CLOSE_MARGIN_MS));
    try {
      [answer] = (
        await finalAnswer(state.values as AgentStateType, { signal: AbortSignal.any([signal, budget]) }, reason)
      ).messages;
    } catch (error) {
      if (signal.aborted) throw error;
    }
  }
  try {
    await abortAware(graph.updateState(config, { messages: [answer] }, GraphNode.RECOVERY), signal);
  } catch (error) {
    if (signal.aborted) throw error;
    logWarn({
      event: "orchestrator_turn_limit_checkpoint_failed",
      threadId,
      reason,
      error: error instanceof Error ? error.name : "unknown",
      ...context,
    });
  }
  mapper.appendAnswer(writer, extractText(answer.content));
}
