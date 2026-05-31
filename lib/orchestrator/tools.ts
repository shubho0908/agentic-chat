import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { exaSearchTool } from "@/lib/tools/exa";
import { webScrapeTool } from "@/lib/tools/scrape";
import { getToolsForUser } from "@/lib/tools/composio";
import { getConnectedToolkits } from "@/lib/tools/composio/auth";
import type { ComposioToolkit } from "@/lib/tools/composio/config";
import { MAX_TOOLS } from "./constants";
import { logger } from "@/lib/logger";
import { ToolName } from "@/lib/tools/constants";
import { RoutingDecision } from "@/types/chat";

export const ASK_USER_TOOL_NAME = ToolName.ASK_USER;

const askUserOptionSchema = z.object({
  label: z.string().describe("Short option label"),
  description: z.string().describe("One-line consequence of this choice"),
});

const askUserSchema = z.object({
  question: z.string().min(1).describe("The clarification or approval question"),
  reason: z.string().optional().describe("Why input is needed before continuing"),
  title: z.string().optional().describe("Short title for decision card; triggers card UI when set"),
  context: z.string().optional().describe("1-2 sentences on what's at stake"),
  options: z.array(askUserOptionSchema).optional().describe("2-4 mutually exclusive choices"),
  recommendation: z.string().optional().describe("Recommended option with rationale"),
});

const askUserTool = new DynamicStructuredTool({
  name: ASK_USER_TOOL_NAME,
  description:
    "Ask the user a question or present a decision card when you cannot proceed without their input. Use question alone for simple clarifications; add title + options + recommendation for multi-choice decisions.",
  schema: askUserSchema,
  func: async ({ question }) => `Waiting for the user to answer: ${question}`,
});

export async function getToolsForRequest(
  userId: string,
  connectedToolkits?: ComposioToolkit[]
): Promise<DynamicStructuredTool[]> {
  const baseTools: DynamicStructuredTool[] = [askUserTool, webScrapeTool];

  if (process.env.EXA_API_KEY) {
    baseTools.push(exaSearchTool);
  }

  try {
    const toolkits = connectedToolkits ?? (await getConnectedToolkits(userId));
    if (toolkits.length > 0) {
      const composioTools = await getToolsForUser(userId, toolkits);
      const allTools = [...baseTools, ...composioTools];
      if (allTools.length > MAX_TOOLS) {
        logger.warn(`[Tools] User ${userId} has ${allTools.length} tools, capping to ${MAX_TOOLS}`);
      }
      return allTools.slice(0, MAX_TOOLS);
    }
  } catch (error) {
    logger.error("[Tools] Failed to load Composio tools, using base tools only:", error);
  }

  return baseTools;
}

export function filterToolsForContext(
  allTools: DynamicStructuredTool[],
  routingDecision?: RoutingDecision,
  plannedTools?: string[]
): DynamicStructuredTool[] {
  const alwaysInclude: string[] = [ToolName.ASK_USER];

  if (plannedTools && plannedTools.length > 0) {
    return allTools.filter(
      (t) => alwaysInclude.includes(t.name) || plannedTools.includes(t.name)
    );
  }

  switch (routingDecision) {
    case RoutingDecision.VisionOnly:
    case RoutingDecision.DocumentsOnly:
      return allTools.filter(
        (t) => alwaysInclude.includes(t.name) || t.name === ToolName.WEB_SCRAPE
      );

    case RoutingDecision.UrlContent:
      return allTools.filter(
        (t) =>
          alwaysInclude.includes(t.name) ||
          t.name === ToolName.WEB_SCRAPE ||
          t.name === ToolName.WEB_SEARCH
      );

    default:
      return allTools;
  }
}
