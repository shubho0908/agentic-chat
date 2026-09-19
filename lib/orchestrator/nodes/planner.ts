import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import type { DynamicStructuredTool } from "@langchain/core/tools";
import type { AgentStateType, AgentToolPlan } from "../state";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { dispatchCustomEvent } from "@langchain/core/callbacks/dispatch";
import { PlanComplexity, CustomEventName } from "../constants";
import type { PlanComplexityValue } from "../constants";
import { logger } from "@/lib/logger";
import {
  getChatReasoningEffort,
  getSupportedTemperature,
} from "@/lib/modelPolicy";
import { z } from "zod";
import { withRetry } from "@/lib/retry";
import { JSON_ONLY_RESPONSE_PROMPT } from "@/lib/prompts";
import {
  evaluatePlannerWithJev,
  mapJevPlannerResult,
  type JevPlannerState,
} from "@/lib/jev/planner";
import { getJevMode } from "@/lib/jev/config";
import { JevCheckpoint, JevFallbackReason, JevMode } from "@/lib/jev/types";
import { JevDecisionClient } from "@/lib/jev/client";
import { logJevDecision } from "@/lib/jev/telemetry";
import { createRequestId } from "@/lib/observability";

export const PLANNER_SYSTEM_PROMPT = `You are a planning module. Given the user's message and conversation context, produce a brief execution plan.

${JSON_ONLY_RESPONSE_PROMPT}

Output ONLY a JSON object (no markdown, no explanation):
{
  "complexity": "direct" | "tool_needed" | "multi_step",
  "tools_needed": [],
  "plan": "one-line description of approach"
}

Rules:
- "direct": simple question answerable without tools (greetings, knowledge questions, follow-ups)
- "tool_needed": needs exactly one tool call (single search, single email read)
- "multi_step": needs multiple tool calls or chained reasoning
- tools_needed: list tool names that will likely be needed (from available tools)
- Keep plan under 30 words
- CRITICAL: All tools are pre-authenticated as the user. NEVER plan to ask for usernames, workspace URLs, account IDs, API keys, or credentials.
- If a tool needs an object id, plan to discover it via search/list/fetch first.
- For structured connector data, discover the object first, inspect schema/metadata/options when available, then query using exact field names and exact option values from the tool response.
- For mutation requests (create/update/insert/append/delete/archive/send), include the matching write tool slug in tools_needed. NEVER plan to "tell the user how to do it manually" — connector write tools work and will run after user approval.
- RESEARCH: ONLY use deep_research for genuinely complex multi-source research requests where the user EXPLICITLY asks to "research X", "do a deep dive on X", "investigate X thoroughly", or asks for a "comprehensive comparison/analysis" that requires synthesizing multiple sources. Simple questions like "tell me about X", "what is X", "compare A vs B" (without explicit research language), or "explain X" are NOT research — answer them directly or use web_search for a quick fact. The bar for deep_research is HIGH: the user must clearly want a multi-step investigation, not just information.`;

const MIN_PLANNABLE_LENGTH = 10;
const PLANNER_TIMEOUT_MS = 15_000;
const JEV_SHADOW_TAIL_TURNS = 4;
const JEV_SHADOW_TAIL_CONTENT_CHARS = 500;

const jevClient = JevDecisionClient.createIfConfigured();

export function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join(" ");
  }
  return JSON.stringify(content);
}

function buildShadowState(
  messages: AgentStateType["messages"],
  latestMessage: string,
  connectedServices: string[],
): JevPlannerState {
  return {
    latestMessage,
    conversationTail: messages
      .slice(-(JEV_SHADOW_TAIL_TURNS + 1), -1)
      .map((m) => ({
        role: m._getType() === "human" ? ("user" as const) : ("assistant" as const),
        content: extractText(m.content).slice(0, JEV_SHADOW_TAIL_CONTENT_CHARS),
      }))
      .filter((m) => m.content.length > 0),
    connectedToolkits: connectedServices,
  };
}

/** Runs Jev alongside the current planner and logs a redacted comparison
 * record. Shadow-only: never throws, never affects the production plan. */
async function runJevPlannerShadow(
  state: JevPlannerState,
  productionPlan: AgentToolPlan | null,
  conversationId: string | undefined,
): Promise<void> {
  if (!jevClient) return;
  const requestId = createRequestId("jev_planner");
  const startedAt = Date.now();
  try {
    const result = await evaluatePlannerWithJev(jevClient, state, {
      requestId,
      conversationId,
    });
    const decision = mapJevPlannerResult(result);
    if (!decision) {
      logJevDecision({
        checkpoint: JevCheckpoint.PLANNER,
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

    const productionComplexity = productionPlan?.complexity ?? null;
    logJevDecision({
      checkpoint: JevCheckpoint.PLANNER,
      schemaVersion: "1.0.0",
      modelVersion: result.modelVersion,
      mode: JevMode.SHADOW,
      latencyMs: result.latencyMs,
      outcome:
        productionComplexity === null
          ? "no_production_baseline"
          : decision.complexity === productionComplexity
            ? "agree"
            : "disagree",
      probabilities: decision.complexityProbabilities,
      confidence: decision.complexityConfidence,
      fallbackUsed: false,
      inputTokens: result.usage?.input_tokens,
      outputTokens: result.usage?.output_tokens,
      requestId,
      conversationId,
    });
  } catch (error) {
    logJevDecision({
      checkpoint: JevCheckpoint.PLANNER,
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
 * async function, so this catches sync throws too and the planner never
 * depends on shadow. */
function queueJevPlannerShadow(
  messages: AgentStateType["messages"],
  latestMessage: string,
  connectedServices: string[],
  productionPlan: AgentToolPlan | null,
  conversationId: string | undefined,
): void {
  try {
    void runJevPlannerShadow(
      buildShadowState(messages, latestMessage, connectedServices),
      productionPlan,
      conversationId,
    ).catch((error) =>
      logger.warn("[Planner] Jev shadow evaluation failed:", error),
    );
  } catch (error) {
    logger.warn("[Planner] Jev shadow evaluation failed:", error);
  }
}

const plannerResponseSchema = z.object({
  complexity: z.string().optional(),
  tools_needed: z.array(z.string()).optional(),
  plan: z.string().optional(),
});

function isValidComplexity(value: unknown): value is PlanComplexityValue {
  return (
    value === PlanComplexity.DIRECT ||
    value === PlanComplexity.TOOL_NEEDED ||
    value === PlanComplexity.MULTI_STEP
  );
}

export function createPlannerNode(
  tools: DynamicStructuredTool[],
  apiKey: string,
  model: string,
) {
  const toolNames = tools.map((t) => t.name);
  const toolNameSet = new Set(toolNames);

  const reasoningEffort = getChatReasoningEffort(model, false);
  const supportedTemperature = getSupportedTemperature(model, 0);

  const llm = new ChatOpenAI({
    modelName: model,
    apiKey,
    maxTokens: 150,
    timeout: PLANNER_TIMEOUT_MS,
    ...(supportedTemperature !== undefined
      ? { temperature: supportedTemperature }
      : {}),
    ...(reasoningEffort && reasoningEffort !== "none"
      ? { reasoning: { effort: reasoningEffort } }
      : reasoningEffort === "none"
        ? { reasoningEffort: "none" }
        : {}),
  });

  return async (state: AgentStateType, config?: LangGraphRunnableConfig) => {
    const lastMessage = state.messages[state.messages.length - 1];
    if (!lastMessage) return { messages: [] };

    const content =
      typeof lastMessage.content === "string"
        ? lastMessage.content
        : Array.isArray(lastMessage.content)
          ? lastMessage.content
              .filter(
                (p): p is { type: "text"; text: string } => p.type === "text",
              )
              .map((p) => p.text)
              .join(" ")
          : JSON.stringify(lastMessage.content);

    if (content.length < MIN_PLANNABLE_LENGTH) {
      return { messages: [] };
    }

    const jevShadow = getJevMode(JevCheckpoint.PLANNER) === JevMode.SHADOW;

    try {
      const connected = state.connectedServices ?? [];
      const connectedContext =
        connected.length > 0
          ? `\n\nConnected services (pre-authenticated, never ask for credentials): ${connected.join(", ")}`
          : "";

      const messages = [
        new SystemMessage(
          `${PLANNER_SYSTEM_PROMPT}\n\nAvailable tools: ${toolNames.join(", ")}${connectedContext}`,
        ),
        new HumanMessage(content),
      ];

      const response = await withRetry(
        (signal) => llm.invoke(messages, { ...(config ?? {}), signal }),
        {
          retries: 1,
          initialDelayMs: 400,
          signal: config?.signal,
        },
      );

      const planText =
        typeof response.content === "string" ? response.content : "";
      const cleaned = planText.replace(/```json?\n?|\n?```/g, "").trim();
      const parsed = plannerResponseSchema.parse(JSON.parse(cleaned));

      const complexity: PlanComplexityValue = isValidComplexity(
        parsed.complexity,
      )
        ? parsed.complexity
        : PlanComplexity.DIRECT;

      const plan: AgentToolPlan = {
        complexity,
        tools_needed: Array.isArray(parsed.tools_needed)
          ? parsed.tools_needed.filter((t: string) => toolNameSet.has(t))
          : [],
        plan: typeof parsed.plan === "string" ? parsed.plan : "",
      };

      if (jevShadow) {
        queueJevPlannerShadow(
          state.messages,
          content,
          connected,
          plan,
          state.conversationId,
        );
      }

      await dispatchCustomEvent(
        CustomEventName.PLANNING,
        { plan },
        config ?? {},
      );

      if (plan.complexity !== PlanComplexity.DIRECT) {
        return {
          toolPlan: plan,
          messages: [
            new SystemMessage(
              `[PLAN] Complexity: ${plan.complexity}. Tools: ${plan.tools_needed.join(", ") || "none"}. Approach: ${plan.plan}`,
            ),
          ],
        };
      }

      return { messages: [], toolPlan: plan };
    } catch (error) {
      if (jevShadow) {
        queueJevPlannerShadow(
          state.messages,
          content,
          state.connectedServices ?? [],
          null,
          state.conversationId,
        );
      }
      logger.warn(
        "[Planner] Failed to produce a valid plan; continuing without planner hint:",
        error,
      );
      return { messages: [] };
    }
  };
}
