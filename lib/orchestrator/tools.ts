import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { exaSearchTool } from "@/lib/tools/exa";
import { webScrapeTool, webCrawlTool } from "@/lib/tools/scrape";
import { getToolsForUser } from "@/lib/tools/composio";
import { getConnectedToolkits } from "@/lib/tools/composio/auth";
import {
  COMPOSIO_TOOLKITS,
  getComposioToolkitForToolName,
  getEssentialComposioToolSlugs,
  type ComposioToolkit,
} from "@/lib/tools/composio/config";
import { createDeepResearchTool } from "./sub-agents";
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

const MAX_AGENT_STEP_TOOLS = 18;

const TOOLKIT_INTENT_TERMS: Record<ComposioToolkit, string[]> = {
  gmail: ["gmail", "email", "mail", "inbox"],
  googlecalendar: ["calendar", "meeting", "schedule"],
  googledrive: ["drive", "folder"],
  googledocs: ["docs", "google doc"],
  googlesheets: ["sheets", "spreadsheet"],
  slack: ["slack", "channel", "dm"],
  notion: ["notion"],
  github: ["github", "repo", "repository", "pull request", "branch", "commit"],
  linear: ["linear", "issue", "ticket", "cycle"],
};

const WEB_SEARCH_TERMS = [
  "latest",
  "today",
  "news",
  "current",
  "recent",
  "web",
  "internet",
  "online",
  "price",
  "weather",
];

const CRAWL_INTENT_TERMS = [
  "scrape",
  "crawl",
  "fetch the page",
  "fetch this page",
  "fetch that page",
  "open the link",
  "open this link",
  "open that link",
  "open the url",
  "follow the link",
  "follow this link",
  "follow that link",
  "follow the links",
  "visit the site",
  "visit this site",
  "visit that site",
  "visit the website",
  "visit this website",
  "visit that website",
  "visit the page",
  "visit this page",
  "visit the url",
  "browse the site",
  "browse this site",
  "browse the website",
  "browse this website",
  "browse the web",
  "go to the site",
  "go to this site",
  "go to the website",
  "go to this website",
  "go to the url",
  "load the page",
  "load this page",
  "load the url",
  "read the page",
  "read this page",
  "read that page",
  "read the article",
  "read this article",
  "read the website",
  "read this website",
  "extract from the site",
  "extract from this site",
  "extract from the page",
  "extract from this page",
  "scrape the site",
  "scrape this site",
  "scrape the website",
  "scrape this website",
  "scrape the page",
  "scrape this page",
  "scrape the url",
  "crawl the site",
  "crawl this site",
  "crawl the website",
  "crawl this website",
];

const DEEP_RESEARCH_PHRASES = [
  "deep research",
  "research thoroughly",
  "research about",
  "research on",
  "research into",
  "do research",
  "conduct research",
  "in-depth research",
  "comprehensive research",
  "deep dive into",
  "deep dive on",
  "investigate thoroughly",
  "thorough investigation",
  "comprehensive analysis of",
  "comprehensive comparison",
  "detailed comparison of",
  "pros and cons of",
] as const;

const DEEP_RESEARCH_WEAK_SIGNALS = [
  "research",
  "investigate",
] as const;

const DEEP_RESEARCH_WEAK_PATTERNS = DEEP_RESEARCH_WEAK_SIGNALS.map(
  (signal) => new RegExp(`^(please\\s+|can you\\s+|could you\\s+)?${signal}\\b`, "i")
);

const MIN_RESEARCH_QUERY_WORDS = 4;

function qualifiesForDeepResearch(text: string): boolean {
  const lower = text.toLowerCase();
  const wordCount = lower.split(/\s+/).filter(Boolean).length;

  if (wordCount < MIN_RESEARCH_QUERY_WORDS) return false;

  if (DEEP_RESEARCH_PHRASES.some((phrase) => lower.includes(phrase))) return true;

  for (const pattern of DEEP_RESEARCH_WEAK_PATTERNS) {
    if (pattern.test(lower.trim()) && wordCount >= 5) return true;
  }

  return false;
}

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "that",
  "this",
  "into",
  "about",
  "what",
  "when",
  "where",
  "which",
  "show",
  "list",
  "search",
  "fetch",
  "get",
  "find",
  "give",
  "need",
  "want",
  "using",
  "please",
]);

function isComposioToolkit(value: string): value is ComposioToolkit {
  return COMPOSIO_TOOLKITS.includes(value as ComposioToolkit);
}

function tokenizeIntent(text: string): string[] {
  return [...new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/g)
      .filter((token) => token.length >= 3 && !STOPWORDS.has(token))
  )];
}

function getConnectedComposioToolkits(connectedServices: string[] | undefined): ComposioToolkit[] {
  return (connectedServices ?? []).filter(isComposioToolkit);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function includesIntentTerm(text: string, term: string): boolean {
  if (term.includes(" ")) {
    return text.includes(term);
  }
  return new RegExp(`\\b${escapeRegExp(term)}\\b`, "i").test(text);
}

function matchesAnyTerm(text: string, terms: readonly string[]): boolean {
  return terms.some((term) => includesIntentTerm(text, term));
}

function getMentionedToolkits(text: string, connectedServices: string[] | undefined): ComposioToolkit[] {
  const lowerText = text.toLowerCase();
  const connected = getConnectedComposioToolkits(connectedServices);
  const allowed = connected.length > 0 ? new Set<ComposioToolkit>(connected) : null;

  return COMPOSIO_TOOLKITS.filter((toolkit) => {
    if (allowed && !allowed.has(toolkit)) return false;
    return TOOLKIT_INTENT_TERMS[toolkit].some((term) => includesIntentTerm(lowerText, term));
  });
}

function getAnyMentionedToolkits(text: string): ComposioToolkit[] {
  const lowerText = text.toLowerCase();
  return COMPOSIO_TOOLKITS.filter((toolkit) =>
    TOOLKIT_INTENT_TERMS[toolkit].some((term) => includesIntentTerm(lowerText, term))
  );
}

export function getAnyMentionedComposioToolkits(text: string): ComposioToolkit[] {
  return getAnyMentionedToolkits(text);
}

function getToolkitsFromToolNames(toolNames: string[]): ComposioToolkit[] {
  const toolkits = toolNames
    .map(getComposioToolkitForToolName)
    .filter((toolkit): toolkit is ComposioToolkit => toolkit !== null);
  return [...new Set(toolkits)];
}

function addToolByName(
  selected: Map<string, DynamicStructuredTool>,
  toolsByName: Map<string, DynamicStructuredTool>,
  name: string,
): void {
  const tool = toolsByName.get(name);
  if (tool && !selected.has(tool.name)) {
    selected.set(tool.name, tool);
  }
}

function addToolsByName(
  selected: Map<string, DynamicStructuredTool>,
  toolsByName: Map<string, DynamicStructuredTool>,
  names: string[],
): void {
  for (const name of names) {
    addToolByName(selected, toolsByName, name);
  }
}

function scoreToolForIntent(
  tool: DynamicStructuredTool,
  intentTerms: string[],
  rawText: string,
  targetToolkits: Set<ComposioToolkit>,
  plannedTools: Set<string>,
): number {
  if (plannedTools.has(tool.name)) return 1_000;

  const toolkit = getComposioToolkitForToolName(tool.name);
  if (toolkit && targetToolkits.size > 0 && !targetToolkits.has(toolkit)) {
    return -1;
  }

  let score = toolkit && targetToolkits.has(toolkit) ? 40 : 0;
  const name = tool.name.toLowerCase();
  const description = (tool.description ?? "").toLowerCase();
  const haystack = `${name} ${description}`;

  const intentScore = intentTerms.reduce((acc, term) => acc + (name.includes(term) ? 8 : description.includes(term) ? 3 : 0), 0);
  score += intentScore;

  if (tool.name === ToolName.WEB_SEARCH && matchesAnyTerm(rawText, WEB_SEARCH_TERMS)) {
    score += 35;
  }
  if (tool.name === ToolName.WEB_SCRAPE && /https?:\/\//i.test(rawText)) {
    score += 35;
  }
  if (tool.name === ToolName.WEB_CRAWL && (/https?:\/\//i.test(rawText) || matchesAnyTerm(rawText, CRAWL_INTENT_TERMS))) {
    score += 35;
  }
  if (toolkit && !targetToolkits.has(toolkit) && !intentTerms.some((term) => haystack.includes(term))) {
    score -= 15;
  }

  return score;
}

interface ToolSelectionContext {
  latestUserText?: string;
  plannedTools?: string[];
  connectedServices?: string[];
  maxTools?: number;
}

export function selectToolsForAgentStep(
  allTools: DynamicStructuredTool[],
  context: ToolSelectionContext = {},
): DynamicStructuredTool[] {
  const maxTools = Math.max(1, context.maxTools ?? MAX_AGENT_STEP_TOOLS);
  const toolsByName = new Map(allTools.map((tool) => [tool.name, tool]));
  const selected = new Map<string, DynamicStructuredTool>();
  const latestUserText = context.latestUserText ?? "";
  const rawText = latestUserText.toLowerCase();
  const mentionedToolkits = getMentionedToolkits(latestUserText, context.connectedServices);
  const mentionedToolkitSet = new Set(mentionedToolkits);
  const plannedTools = [...new Set(context.plannedTools ?? [])].filter((toolName) => {
    const toolkit = getComposioToolkitForToolName(toolName);
    return !toolkit || mentionedToolkitSet.size === 0 || mentionedToolkitSet.has(toolkit);
  });
  const plannedToolSet = new Set(plannedTools);

  addToolByName(selected, toolsByName, ToolName.ASK_USER);
  addToolByName(selected, toolsByName, ToolName.WEB_SEARCH);
  addToolByName(selected, toolsByName, ToolName.WEB_SCRAPE);
  addToolByName(selected, toolsByName, ToolName.WEB_CRAWL);
  addToolsByName(selected, toolsByName, plannedTools);

  const targetToolkits = new Set<ComposioToolkit>([
    ...mentionedToolkits,
    ...getToolkitsFromToolNames(plannedTools),
  ]);

  addToolsByName(selected, toolsByName, getEssentialComposioToolSlugs(targetToolkits));

  if (qualifiesForDeepResearch(latestUserText)) {
    addToolByName(selected, toolsByName, ToolName.DEEP_RESEARCH);
  }

  const intentTerms = tokenizeIntent(latestUserText);
  const ranked: { tool: typeof allTools[number]; score: number }[] = [];
  for (const tool of allTools) {
    if (selected.has(tool.name)) continue;
    const score = scoreToolForIntent(tool, intentTerms, rawText, targetToolkits, plannedToolSet);
    if (score > 0) ranked.push({ tool, score });
  }
  ranked.sort((a, b) => b.score - a.score || a.tool.name.localeCompare(b.tool.name));

  for (const { tool } of ranked) {
    if (selected.size >= maxTools) break;
    selected.set(tool.name, tool);
  }

  return [...selected.values()].slice(0, maxTools);
}

export function hasWebActionIntent(latestUserText: string): boolean {
  const rawText = latestUserText.toLowerCase();
  return (
    /https?:\/\//i.test(latestUserText) ||
    matchesAnyTerm(rawText, CRAWL_INTENT_TERMS) ||
    matchesAnyTerm(rawText, WEB_SEARCH_TERMS)
  );
}

export function shouldBypassSemanticCacheForToolIntent(
  latestUserText: string,
  _connectedServices?: string[],
): boolean {
  void _connectedServices;
  const rawText = latestUserText.toLowerCase();
  return (
    getAnyMentionedToolkits(latestUserText).length > 0 ||
    matchesAnyTerm(rawText, WEB_SEARCH_TERMS) ||
    matchesAnyTerm(rawText, CRAWL_INTENT_TERMS) ||
    qualifiesForDeepResearch(latestUserText) ||
    /https?:\/\//i.test(latestUserText)
  );
}

export async function getToolsForRequest(
  userId: string,
  connectedToolkits?: ComposioToolkit[],
  options?: { apiKey?: string; model?: string }
): Promise<DynamicStructuredTool[]> {
  const baseTools: DynamicStructuredTool[] = [askUserTool, webScrapeTool, webCrawlTool];

  if (process.env.EXA_API_KEY) {
    baseTools.push(exaSearchTool);
  }

  if (options?.apiKey) {
    baseTools.push(createDeepResearchTool(options.apiKey, options.model ?? "gpt-4o-mini", userId));
  }

  try {
    const toolkits = connectedToolkits ?? (await getConnectedToolkits(userId));
    if (toolkits.length > 0) {
      const composioTools = await getToolsForUser(userId, toolkits);
      const allTools = [...baseTools, ...composioTools];
      if (allTools.length > MAX_TOOLS) {
        logger.warn(
          `[Tools] User ${userId} has ${allTools.length} loaded tools; per-step selection will cap model-bound tools to ${MAX_AGENT_STEP_TOOLS}`
        );
      }
      return allTools;
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
    const plannedToolkits = getToolkitsFromToolNames(plannedTools);
    const prerequisiteTools = getEssentialComposioToolSlugs(plannedToolkits);
    const allowedTools = new Set([...alwaysInclude, ...plannedTools, ...prerequisiteTools]);
    return allTools.filter(
      (t) => allowedTools.has(t.name)
    );
  }

  switch (routingDecision) {
    case RoutingDecision.VisionOnly:
    case RoutingDecision.DocumentsOnly:
      return allTools.filter(
        (t) => alwaysInclude.includes(t.name) || t.name === ToolName.WEB_SCRAPE
      );

    default:
      return allTools;
  }
}
