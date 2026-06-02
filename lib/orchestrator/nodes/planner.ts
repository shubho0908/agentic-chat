import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import type { DynamicStructuredTool } from "@langchain/core/tools";
import type { AgentStateType, AgentToolPlan } from "../state";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { dispatchCustomEvent } from "@langchain/core/callbacks/dispatch";
import { PlanComplexity, CustomEventName } from "../constants";
import type { PlanComplexityValue } from "../constants";
import { logger } from "@/lib/logger";
import { getChatReasoningEffort, getSupportedTemperature } from "@/lib/modelPolicy";
import { z } from "zod";
import { withRetry } from "@/lib/retry";

const PLANNER_SYSTEM_PROMPT = `You are a planning module. Given the user's message and conversation context, produce a brief execution plan.

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
  model: string
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
    ...(supportedTemperature !== undefined ? { temperature: supportedTemperature } : {}),
    ...(reasoningEffort && reasoningEffort !== "none"
      ? { reasoning: { effort: reasoningEffort } }
      : reasoningEffort === "none" ? { reasoningEffort: "none" } : {}),
  });

  return async (state: AgentStateType, config?: LangGraphRunnableConfig) => {
    const lastMessage = state.messages[state.messages.length - 1];
    if (!lastMessage) return { messages: [] };

    const content = typeof lastMessage.content === "string"
      ? lastMessage.content
      : JSON.stringify(lastMessage.content);

    if (content.length < MIN_PLANNABLE_LENGTH) {
      return { messages: [] };
    }

    try {
      const connected = state.connectedServices ?? [];
      const connectedContext = connected.length > 0
        ? `\n\nConnected services (pre-authenticated, never ask for credentials): ${connected.join(", ")}`
        : "";

      const messages = [
        new SystemMessage(
          `${PLANNER_SYSTEM_PROMPT}\n\nAvailable tools: ${toolNames.join(", ")}${connectedContext}`
        ),
        new HumanMessage(content),
      ];

      const response = await withRetry(
        (signal) => llm.invoke(messages, { ...(config ?? {}), signal }),
        {
          retries: 2,
          initialDelayMs: 400,
          timeoutMs: PLANNER_TIMEOUT_MS,
          signal: config?.signal,
        }
      );

      const planText = typeof response.content === "string" ? response.content : "";
      const cleaned = planText.replace(/```json?\n?|\n?```/g, "").trim();
      const parsed = plannerResponseSchema.parse(JSON.parse(cleaned));

      const complexity: PlanComplexityValue = isValidComplexity(parsed.complexity)
        ? parsed.complexity
        : PlanComplexity.DIRECT;

      const plan: AgentToolPlan = {
        complexity,
        tools_needed: Array.isArray(parsed.tools_needed)
          ? parsed.tools_needed.filter((t: string) => toolNameSet.has(t))
          : [],
        plan: typeof parsed.plan === "string" ? parsed.plan : "",
      };

      await dispatchCustomEvent(CustomEventName.PLANNING, { plan }, config ?? {});

      if (plan.complexity !== PlanComplexity.DIRECT) {
        return {
          toolPlan: plan,
          messages: [
            new SystemMessage(
              `[PLAN] Complexity: ${plan.complexity}. Tools: ${plan.tools_needed.join(", ") || "none"}. Approach: ${plan.plan}`
            ),
          ],
        };
      }

      return { messages: [], toolPlan: plan };
    } catch (error) {
      logger.warn("[Planner] Failed to produce a valid plan; continuing without planner hint:", error);
      return { messages: [] };
    }
  };
}
