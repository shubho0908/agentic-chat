import { END } from "@langchain/langgraph";
import type { AIMessage, BaseMessage } from "@langchain/core/messages";
import {
  GraphNode,
  MAX_TOOL_ROUNDS,
  RecoveryReason,
  type RecoveryReasonValue,
} from "../constants";
import type { AgentStateType } from "../state";
import { logger } from "@/lib/logger";
import { createRequestId, logWarn } from "@/lib/observability";
import {
  failureRoundsSinceLastHuman,
  hasConsecutiveErrorStreak,
  hasIdenticalFailureLoop,
} from "../toolFailure";
import {
  JEV_TOOL_ROUTER_MAX_CONTENT_CHARS,
  JEV_TOOL_ROUTER_MAX_TOOL_NAMES,
  evaluateToolRouterWithJev,
  mapJevToolRouterResult,
  type JevToolRouterState,
} from "@/lib/jev/toolRouter";
import { getJevMode } from "@/lib/jev/config";
import { JevCheckpoint, JevFallbackReason, JevMode } from "@/lib/jev/types";
import { JevDecisionClient, classifyJevFailure } from "@/lib/jev/client";
import { logJevDecision } from "@/lib/jev/telemetry";
import { extractText } from "./planner";

const jevClient = JevDecisionClient.createIfConfigured();

function countToolRoundsSinceLastHuman(messages: BaseMessage[]): number {
  let count = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.type === "human") break;
    if (msg.type === "ai" && ((msg as AIMessage).tool_calls?.length ?? 0) > 0) count++;
  }
  return count;
}

function buildShadowState(
  messages: BaseMessage[],
  roundNumber: number,
): JevToolRouterState {
  const recentToolNames: string[] = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.type === "human") break;
    if (msg.type !== "ai") continue;
    for (const tc of (msg as AIMessage).tool_calls ?? []) {
      if (typeof tc.name === "string" && tc.name) {
        recentToolNames.unshift(tc.name);
      }
      if (recentToolNames.length >= JEV_TOOL_ROUTER_MAX_TOOL_NAMES) break;
    }
    if (recentToolNames.length >= JEV_TOOL_ROUTER_MAX_TOOL_NAMES) break;
  }

  let latestMessage = "";
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].type === "human") {
      latestMessage = extractText(
        (messages[i] as { content: unknown }).content,
      ).slice(0, JEV_TOOL_ROUTER_MAX_CONTENT_CHARS);
      break;
    }
  }

  return {
    roundNumber,
    maxRounds: MAX_TOOL_ROUNDS,
    recentToolNames,
    latestMessage,
  };
}

/** Runs Jev alongside the router and logs a redacted comparison record.
 * Shadow-only: never throws, never affects the production route. */
async function runJevToolRouterShadow(
  shadowState: JevToolRouterState,
  productionRoute: "tools" | typeof END,
  conversationId: string | undefined,
): Promise<void> {
  if (!jevClient) return;
  const requestId = createRequestId("jev_tool_router");
  const startedAt = Date.now();
  try {
    const result = await evaluateToolRouterWithJev(jevClient, shadowState, {
      requestId,
      conversationId,
    });
    const decision = mapJevToolRouterResult(result);
    if (!decision) {
      logWarn({
        event: "jev_tool_router_invalid_response",
        message: "Jev tool router response failed checkpoint mapping",
        ...(result.rawBody && { responseBody: result.rawBody }),
        requestId,
        conversationId,
      });
      logJevDecision({
        checkpoint: JevCheckpoint.TOOL_ROUTER,
        schemaVersion: "1.0.0",
        modelVersion: result.modelVersion,
        mode: JevMode.SHADOW,
        latencyMs: Date.now() - startedAt,
        outcome: "invalid_response",
        fallbackUsed: true,
        fallbackReason: JevFallbackReason.INVALID,
        requestId,
        conversationId,
      });
      return;
    }

    const jevRoute = decision.route === "tools" ? "tools" : END;
    logJevDecision({
      checkpoint: JevCheckpoint.TOOL_ROUTER,
      schemaVersion: "1.0.0",
      modelVersion: result.modelVersion,
      mode: JevMode.SHADOW,
      latencyMs: result.latencyMs,
      outcome: jevRoute === productionRoute ? "agree" : "disagree",
      probabilities: decision.routeProbabilities,
      confidence: decision.routeConfidence,
      fallbackUsed: false,
      inputTokens: result.usage?.input_tokens,
      outputTokens: result.usage?.output_tokens,
      requestId,
      conversationId,
    });
  } catch (error) {
    logJevDecision({
      checkpoint: JevCheckpoint.TOOL_ROUTER,
      schemaVersion: "1.0.0",
      modelVersion: "unknown",
      mode: JevMode.SHADOW,
      latencyMs: Date.now() - startedAt,
      outcome: "error",
      fallbackUsed: true,
      fallbackReason: classifyJevFailure(error),
      requestId,
      conversationId,
    });
  }
}

/** Fire-and-forget wrapper. Building the shadow state runs outside the
 * async function, so this catches sync throws too and the router never
 * depends on shadow. */
function queueJevToolRouterShadow(
  messages: BaseMessage[],
  roundNumber: number,
  productionRoute: "tools" | typeof END,
  conversationId: string | undefined,
): void {
  try {
    void runJevToolRouterShadow(
      buildShadowState(messages, roundNumber),
      productionRoute,
      conversationId,
    ).catch((error) =>
      logger.warn("[ToolRouter] Jev shadow evaluation failed:", error),
    );
  } catch (error) {
    logger.warn("[ToolRouter] Jev shadow evaluation failed:", error);
  }
}

type ToolRoute = "tools" | typeof GraphNode.RECOVERY | typeof END;

export function hasAnswerText(message: BaseMessage | undefined): boolean {
  return !!message && extractText(message.content).trim().length > 0;
}

export function classifyRecovery(messages: BaseMessage[]): RecoveryReasonValue {
  const lastMessage = messages[messages.length - 1] as AIMessage | undefined;
  if (!lastMessage?.tool_calls || lastMessage.tool_calls.length === 0) {
    return RecoveryReason.EMPTY_ANSWER;
  }
  return countToolRoundsSinceLastHuman(messages) >= MAX_TOOL_ROUNDS
    ? RecoveryReason.ROUND_LIMIT
    : RecoveryReason.TOOL_FAILURES;
}

/** The graph must never terminate on an AI message whose tool_calls went
 * nowhere: the user would get silence instead of an answer. Every guard that
 * stops tool execution routes to the recovery node, which closes the turn
 * with an answer built from the results gathered so far. */
export function routeAfterAgent(state: AgentStateType): ToolRoute {
  const lastMessage = state.messages[state.messages.length - 1] as AIMessage | undefined;

  if (!lastMessage?.tool_calls || lastMessage.tool_calls.length === 0) {
    if (hasAnswerText(lastMessage)) return END;
    logger.warn("[ToolRouter] Empty final answer; recovering turn");
    return GraphNode.RECOVERY;
  }

  const roundNumber = countToolRoundsSinceLastHuman(state.messages);
  let route: ToolRoute = "tools";
  if (roundNumber >= MAX_TOOL_ROUNDS) {
    logger.warn("[ToolRouter] Round limit reached; recovering turn", {
      roundNumber,
    });
    route = GraphNode.RECOVERY;
  } else {
    const rounds = failureRoundsSinceLastHuman(state.messages);
    if (hasIdenticalFailureLoop(rounds)) {
      logger.warn("[ToolRouter] Identical failure loop; recovering turn", {
        roundNumber,
      });
      route = GraphNode.RECOVERY;
    } else if (hasConsecutiveErrorStreak(rounds)) {
      logger.warn("[ToolRouter] Consecutive error streak; recovering turn", {
        roundNumber,
      });
      route = GraphNode.RECOVERY;
    }
  }

  if (getJevMode(JevCheckpoint.TOOL_ROUTER) === JevMode.SHADOW) {
    queueJevToolRouterShadow(
      state.messages,
      roundNumber,
      route === "tools" ? "tools" : END,
      state.conversationId,
    );
  }

  return route;
}

const MAX_RECOVERY_ERROR_CHARS = 160;

/** First line of a tool result that means something to the user. Skips the
 * machine-readable failure envelope header and hint lines so internal
 * markers never surface as the "error" of a guard-stopped turn. */
function usefulErrorLine(text: string): string | null {
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("[tool-failure:")) continue;
    if (line.startsWith("Hint:")) continue;
    return line.slice(0, MAX_RECOVERY_ERROR_CHARS);
  }
  return null;
}

/** Deterministic closing message for a turn the guards stopped. Names the
 * work left pending and the last failure so the user knows what happened
 * and how to proceed; no LLM call, so the recovery path can never fail. */
export function buildRecoveryMessage(
  messages: BaseMessage[],
  reason: RecoveryReasonValue = classifyRecovery(messages),
): string {
  let pendingTools: string[] = [];
  let lastError: string | null = null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.type === "human") break;
    if (msg.type === "ai" && pendingTools.length === 0) {
      const toolCalls = (msg as AIMessage).tool_calls ?? [];
      if (toolCalls.length > 0) {
        pendingTools = toolCalls.map((tc) =>
          typeof tc.name === "string" && tc.name ? tc.name : "a tool",
        );
      }
    }
    if (msg.type === "tool" && lastError === null) {
      const content = (msg as { content?: unknown }).content;
      if (typeof content === "string") {
        lastError = usefulErrorLine(content);
      }
    }
  }

  const toolList =
    pendingTools.length > 0 ? pendingTools.join(", ") : "the required tools";

  switch (reason) {
    case RecoveryReason.ROUND_LIMIT:
      return (
        `I hit the step limit for a single turn while working on this, with ${toolList} still pending, ` +
        "so I stopped instead of churning. Ask me to continue and I will pick up from here in smaller steps."
      );
    case RecoveryReason.TOOL_FAILURES:
      return (
        `I could not complete this: ${toolList} kept failing across several attempts, so I stopped rather than loop forever.` +
        (lastError ? ` Last error: ${lastError}.` : "") +
        " Rephrase the request or ask me to try again."
      );
    case RecoveryReason.EMPTY_ANSWER:
      return "I finished working on this but could not put the answer into words. Ask me again and I will answer from what I found.";
    case RecoveryReason.STEP_LIMIT:
      return "I hit the step limit for a single turn while working on this, so I stopped here. Ask me to continue and I will pick up from where I left off.";
    default: {
      const unreachable: never = reason;
      return unreachable;
    }
  }
}
