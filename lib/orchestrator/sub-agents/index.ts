import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { invokeResearchAgent } from "./research/graph";
import { logger } from "@/lib/logger";
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

export function createDeepResearchTool(apiKey: string, model: string): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: ToolName.DEEP_RESEARCH,
    description:
      "Conduct deep, multi-step research on a complex topic. Use when the user asks to research something thoroughly, compare multiple options, or needs comprehensive analysis with cited sources. This performs multiple web searches, cross-references sources, and synthesizes findings. If it returns CLARIFICATION_NEEDED, use ask_user to get answers, then re-call this tool with the answers in userContext.",
    schema: deepResearchSchema,
    func: async ({ query, userContext }, runManager) => {
      try {
        const config = runManager?.getChild()
          ? { callbacks: runManager.getChild() }
          : undefined;
        return await invokeResearchAgent(query, apiKey, model, config, { userContext });
      } catch (error) {
        logger.error("[DeepResearch] Sub-agent failed:", error);
        return `Research could not be completed: ${error instanceof Error ? error.message : "Unknown error"}. I'll answer based on available knowledge.`;
      }
    },
  });
}
