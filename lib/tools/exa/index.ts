import Exa from "exa-js";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { withRetry } from "@/lib/retry";
import { logger } from "@/lib/logger";

let exaClient: Exa | null = null;

function getExaClient(): Exa {
  if (!exaClient) {
    const apiKey = process.env.EXA_API_KEY;
    if (!apiKey) {
      throw new Error("EXA_API_KEY environment variable is not set");
    }
    exaClient = new Exa(apiKey);
  }
  return exaClient;
}

const exaSearchSchema = z.object({
  query: z.string().describe("The search query — be specific and clear"),
  numResults: z
    .number()
    .min(1)
    .max(10)
    .optional()
    .default(5)
    .describe("Number of results to return (1-10)"),
  category: z
    .enum(["company", "research paper", "news", "pdf", "personal site", "financial report", "people"])
    .optional()
    .describe("Optional category to focus the search on"),
  includeDomains: z
    .array(z.string())
    .optional()
    .describe("Optional list of domains to restrict search to"),
});

export const exaSearchTool = new DynamicStructuredTool({
  name: "web_search",
  description:
    "Search the web for current information, news, research, documentation, etc. Use when you need up-to-date information not in your training data.",
  schema: exaSearchSchema,
  func: async ({ query, numResults = 5, category, includeDomains }) => {
    try {
      const exa = getExaClient();

      const response = await withRetry(
        () =>
          exa.search(query, {
            type: "auto",
            numResults,
            ...(category && { category }),
            ...(includeDomains?.length && { includeDomains }),
            contents: {
              text: { maxCharacters: 1500 },
              highlights: true,
            },
          }),
        { retries: 2, initialDelayMs: 300 }
      );

      if (!response.results.length) {
        return "No results found for this query.";
      }

      const formatted = response.results
        .map((r, i) => {
          const highlights = r.highlights?.length
            ? `\nKey points:\n${r.highlights.slice(0, 3).map((h) => `  • ${h}`).join("\n")}`
            : "";
          const text = r.text ? `\n${r.text.slice(0, 800)}` : "";
          return `[${i + 1}] ${r.title || "Untitled"}\nURL: ${r.url}${highlights}${text}`;
        })
        .join("\n\n---\n\n");

      return formatted;
    } catch (error) {
      logger.error("[Exa Search] Failed:", error);
      return `Web search failed: ${error instanceof Error ? error.message : "Unknown error"}. I'll answer based on my existing knowledge.`;
    }
  },
});
