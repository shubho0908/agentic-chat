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
      "Conduct deep, multi-step research on a complex topic. ONLY use when the user EXPLICITLY asks to 'research', 'investigate thoroughly', or 'deep dive' into a topic requiring synthesis from multiple sources. Do NOT use for simple questions, basic comparisons, 'tell me about X', or anything answerable with a single web search or your knowledge. This is expensive — it performs multiple web searches, cross-references sources, and synthesizes findings.",
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
