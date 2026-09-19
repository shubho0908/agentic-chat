import { END } from "@langchain/langgraph";
import type { AIMessage, BaseMessage } from "@langchain/core/messages";
import type { AgentStateType } from "../state";
import { logger } from "@/lib/logger";
import { createRequestId } from "@/lib/observability";
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
import { JevDecisionClient } from "@/lib/jev/client";
import { logJevDecision } from "@/lib/jev/telemetry";
import { extractText } from "./planner";

const MAX_TOOL_ROUNDS = 15;

const jevClient = JevDecisionClient.createIfConfigured();

export function countToolRoundsSinceLastHuman(messages: BaseMessage[]): number {
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
      fallbackReason:
        error instanceof Error && error.name === "AbortError"
          ? JevFallbackReason.TIMEOUT
          : JevFallbackReason.ERROR,
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

export function routeAfterAgent(state: AgentStateType): "tools" | typeof END {
  const lastMessage = state.messages[state.messages.length - 1] as AIMessage | undefined;

  if (!lastMessage?.tool_calls || lastMessage.tool_calls.length === 0) {
    return END;
  }

  const roundNumber = countToolRoundsSinceLastHuman(state.messages);
  let route: "tools" | typeof END = "tools";
  if (roundNumber >= MAX_TOOL_ROUNDS) {
    route = END;
  } else {
    const rounds = failureRoundsSinceLastHuman(state.messages);
    if (hasIdenticalFailureLoop(rounds)) {
      logger.warn("[ToolRouter] Identical failure loop; ending turn", {
        roundNumber,
      });
      route = END;
    } else if (hasConsecutiveErrorStreak(rounds)) {
      logger.warn("[ToolRouter] Consecutive error streak; ending turn", {
        roundNumber,
      });
      route = END;
    }
  }

  if (getJevMode(JevCheckpoint.TOOL_ROUTER) === JevMode.SHADOW) {
    queueJevToolRouterShadow(
      state.messages,
      roundNumber,
      route,
      state.conversationId,
    );
  }

  return route;
}
