import { AIMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import type { StreamWriter } from "@/lib/chat/safeStream";
import { logWarn } from "@/lib/observability";
import { abortAware } from "./abortAware";
import { GraphNode, RECURSION_LIMIT } from "./constants";
import type { createStreamEventMapper } from "./streaming";

export const STEP_LIMIT_ANSWER =
  "I hit the step limit for a single turn while working on this, so I stopped here. Ask me to continue and I will pick up from where I left off.";

export const GRAPH_RUN_LIMITS = { recursionLimit: RECURSION_LIMIT } as const;

interface StepLimitGraph {
  updateState(
    config: { configurable: { thread_id: string } },
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
  threadId: string,
  writer: StreamWriter,
  mapper: ReturnType<typeof createStreamEventMapper>,
  signal: AbortSignal,
  context: Record<string, unknown>,
): Promise<void> {
  logWarn({ event: "orchestrator_step_limit_closed", threadId, ...context });
  try {
    await abortAware(
      graph.updateState(
        { configurable: { thread_id: threadId } },
        { messages: [new AIMessage({ content: STEP_LIMIT_ANSWER })] },
        GraphNode.RECOVERY,
      ),
      signal,
    );
  } catch (error) {
    logWarn({
      event: "orchestrator_step_limit_checkpoint_failed",
      threadId,
      error: error instanceof Error ? error.name : "unknown",
      ...context,
    });
  }
  mapper.appendAnswer(writer, STEP_LIMIT_ANSWER);
}
