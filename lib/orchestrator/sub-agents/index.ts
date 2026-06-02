import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { invokeResearchAgent } from "./research/graph";
import { logger } from "@/lib/logger";
import { isRateLimited, recordUsage, RATE_LIMITS } from "@/lib/rateLimit";
import { createRequestId } from "@/lib/observability";
import { ToolName } from "@/lib/tools/constants";

const deepResearchSchema = z.object({
  query: z
    .string()
    .min(5)
    .describe("The research question or topic to investigate thoroughly"),
  userContext: z
    .string()
    .optional()
    .describe("Additional context or clarifications from the user (pass answers from ask_user here when re-invoking after clarification)"),
});

export function createDeepResearchTool(apiKey: string, model: string, userId?: string): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: ToolName.DEEP_RESEARCH,
    description:
      "Conduct deep, multi-step research on a complex topic. ONLY use when the user EXPLICITLY asks to 'research', 'investigate thoroughly', or 'deep dive' into a topic requiring synthesis from multiple sources. Do NOT use for simple questions, basic comparisons, 'tell me about X', or anything answerable with a single web search or your knowledge. This is expensive — it performs multiple web searches, cross-references sources, and synthesizes findings.",
    schema: deepResearchSchema,
    func: async ({ query, userContext }, runManager, toolConfig) => {
      if (userId && isRateLimited(userId, "research", RATE_LIMITS.research)) {
        return "I've done several deep research runs recently and need a short cooldown to avoid overloading the search systems. Please wait a few minutes before starting another deep research. In the meantime, I can answer based on my existing knowledge — just ask without requesting research.";
      }

      const researchRunId = createRequestId("research");

      try {
        if (userId) recordUsage(userId, "research");

        const config = {
          ...(toolConfig ?? {}),
          ...(runManager?.getChild() ? { callbacks: runManager.getChild() } : {}),
          metadata: {
            ...(toolConfig?.metadata ?? {}),
            researchRunId,
            userId,
          },
        };
        return await invokeResearchAgent(query, apiKey, model, config, {
          userContext,
          signal: toolConfig?.signal,
        });
      } catch (error) {
        logger.error("[DeepResearch] Sub-agent failed:", { researchRunId, error });
        return `Research could not be completed: ${error instanceof Error ? error.message : "Unknown error"}. I'll answer based on available knowledge.`;
      }
    },
  });
}
