import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import type { DynamicStructuredTool } from "@langchain/core/tools";
import type { AgentStateType } from "../state";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { dispatchCustomEvent } from "@langchain/core/callbacks/dispatch";
import { PlanComplexity, CustomEventName } from "../constants";
import type { PlanComplexityValue } from "../constants";
import { logger } from "@/lib/logger";
import { z } from "zod";

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
- Keep plan under 30 words`;

const MIN_PLANNABLE_LENGTH = 10;

const plannerResponseSchema = z.object({
  complexity: z.string().optional(),
  tools_needed: z.array(z.string()).optional(),
  plan: z.string().optional(),
});

interface PlanResult {
  complexity: PlanComplexityValue;
  tools_needed: string[];
  plan: string;
}

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

  const llm = new ChatOpenAI({
    modelName: model,
    apiKey,
    temperature: 0,
    maxTokens: 150,
    reasoning: { effort: "none" },
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
      const response = await llm.invoke(
        [
          new SystemMessage(
            `${PLANNER_SYSTEM_PROMPT}\n\nAvailable tools: ${toolNames.join(", ")}`
          ),
          new HumanMessage(content),
        ],
        config
      );

      const planText = typeof response.content === "string" ? response.content : "";
      const cleaned = planText.replace(/```json?\n?|\n?```/g, "").trim();
      const parsed = plannerResponseSchema.parse(JSON.parse(cleaned));

      const complexity: PlanComplexityValue = isValidComplexity(parsed.complexity)
        ? parsed.complexity
        : PlanComplexity.DIRECT;

      const plan: PlanResult = {
        complexity,
        tools_needed: Array.isArray(parsed.tools_needed)
          ? parsed.tools_needed.filter((t: string) => toolNameSet.has(t))
          : [],
        plan: typeof parsed.plan === "string" ? parsed.plan : "",
      };

      await dispatchCustomEvent(CustomEventName.PLANNING, { plan }, config ?? {});

      if (plan.complexity !== PlanComplexity.DIRECT) {
        return {
          messages: [
            new SystemMessage(
              `[PLAN] Complexity: ${plan.complexity}. Tools: ${plan.tools_needed.join(", ") || "none"}. Approach: ${plan.plan}`
            ),
          ],
        };
      }

      return { messages: [] };
    } catch (error) {
      logger.warn("[Planner] Failed to produce a valid plan; continuing without planner hint:", error);
      return { messages: [] };
    }
  };
}
