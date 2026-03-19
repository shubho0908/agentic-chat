import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import type { Message } from "@/lib/schemas/chat";
import { extractConversationHistory } from "@/lib/chat/messageHelpers";
import { getStageModel } from "@/lib/modelPolicy";
import { logger } from "@/lib/logger";
import { extractUrlsFromMessage, stripUrlsFromText } from "@/lib/url-scraper/scraper";

const LEADING_SEARCH_COMMAND_REGEX =
  /^(?:please\s+)?(?:(?:web|internet)\s+)?search(?:\s+the\s+web)?(?:\s+(?:for|about|on))?(?:\s+|$)/i;
const TRAILING_SEARCH_COMMAND_REGEX =
  /(?:,|\s)+(?:please\s+)?(?:(?:web|internet)\s+)?search(?:\s+the\s+web)?$/i;
const CONTEXT_REFERENCE_REGEX =
  /\b(he|she|they|them|their|theirs|it|its|this|that|these|those|him|his|her|hers|former|latter|same|there|then)\b/i;
const FOLLOW_UP_START_REGEX =
  /^(what|when|where|why|how|who|which|does|do|did|is|are|was|were|can|could|should|would|will|has|have|had|compare|tell|show|list)\b/i;
const FOLLOW_UP_PHRASE_REGEX =
  /^(what about|how about|what else|more on that|tell me more|and what|and how|and when|and where|and why)\b/i;
const URL_LABEL_REGEX =
  /\b(?:(?:my|our|his|her|their|its|the|this|that)\s+)?(?:(?:official|personal|company|project|portfolio)\s+)?(?:website|site|url|link|page|profile|homepage)\b\s*:?\s*/gi;
const TRAILING_CONNECTOR_REGEX =
  /(?:^|[\s,;:()/-])(?:and|or|with|via|from|using|at|on)\s*$/i;
const COMMON_TLD_SEGMENTS = new Set([
  "ai",
  "app",
  "co",
  "com",
  "dev",
  "edu",
  "gov",
  "in",
  "io",
  "net",
  "org",
  "uk",
  "us",
]);

const contextualQuerySchema = z.object({
  rewrittenQuery: z.string().min(1),
  usedConversationContext: z.boolean(),
  rationale: z.string(),
});

export interface WebSearchQueryResolution {
  originalQuery: string;
  resolvedQuery: string;
  usedConversationContext: boolean;
  rationale?: string;
}

function deriveFallbackQueryFromUrls(urls: string[]): string {
  const fallbackTerms = urls
    .map((url) => {
      try {
        const host = new URL(url).hostname.replace(/^www\./i, "");
        const labels = host
          .split(".")
          .filter(Boolean)
          .filter((label) => !COMMON_TLD_SEGMENTS.has(label.toLowerCase()))
          .map((label) => label.replace(/[-_]+/g, " "));

        return labels.join(" ").trim() || host;
      } catch {
        return "";
      }
    })
    .filter(Boolean);

  return Array.from(new Set(fallbackTerms)).join(" ").trim();
}

export function prepareWebSearchQuery(rawQuery: string): {
  originalQuery: string;
  searchQuery: string;
  explicitUrls: string[];
} {
  const originalQuery = rawQuery.trim();
  const explicitUrls = extractUrlsFromMessage(originalQuery);

  if (!originalQuery) {
    return {
      originalQuery,
      searchQuery: "",
      explicitUrls,
    };
  }

  let searchQuery = stripUrlsFromText(originalQuery)
    .replace(/\(\s*\)/g, " ")
    .replace(/\[\s*\]/g, " ")
    .replace(/\s+([,.;!?])/g, "$1")
    .replace(/([,.;!?]){2,}/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

  if (explicitUrls.length > 0) {
    searchQuery = searchQuery.replace(URL_LABEL_REGEX, " ").replace(/\s+/g, " ").trim();
  }

  searchQuery = searchQuery
    .replace(TRAILING_CONNECTOR_REGEX, " ")
    .replace(/^[,;:()[\]/\-\s]+|[,;:()[\]/\-\s]+$/g, "")
    .trim();

  if (!searchQuery && explicitUrls.length > 0) {
    searchQuery = deriveFallbackQueryFromUrls(explicitUrls);
  }

  return {
    originalQuery,
    searchQuery,
    explicitUrls,
  };
}

export function stripSearchCommandPhrases(rawQuery: string): string {
  const trimmed = rawQuery.trim();

  if (!trimmed) {
    return "";
  }

  return trimmed
    .replace(LEADING_SEARCH_COMMAND_REGEX, "")
    .replace(TRAILING_SEARCH_COMMAND_REGEX, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function needsWebSearchConversationContext(rawQuery: string): boolean {
  const query = stripSearchCommandPhrases(rawQuery);
  const words = query.split(/\s+/).filter(Boolean);

  if (!query) {
    return false;
  }

  if (CONTEXT_REFERENCE_REGEX.test(query)) {
    return true;
  }

  if (FOLLOW_UP_PHRASE_REGEX.test(query)) {
    return true;
  }

  return words.length <= 3 && FOLLOW_UP_START_REGEX.test(query);
}

function formatConversationHistory(messages: Message[]): string {
  const history = extractConversationHistory(messages, {
    excludeLastMessage: true,
    maxExchanges: 4,
    includeAllForShortConversations: true,
  });

  return history
    .map((message) => `${message.role}: ${typeof message.content === "string" ? message.content : ""}`)
    .join("\n");
}

export async function resolveWebSearchQuery({
  query,
  messages,
  apiKey,
  model,
  abortSignal,
}: {
  query: string;
  messages: Message[];
  apiKey?: string;
  model?: string;
  abortSignal?: AbortSignal;
}): Promise<WebSearchQueryResolution> {
  const originalQuery = query.trim();
  const cleanedQuery = stripSearchCommandPhrases(originalQuery) || originalQuery;
  const history = formatConversationHistory(messages);

  if (!cleanedQuery || !history || !needsWebSearchConversationContext(cleanedQuery) || !apiKey || !model) {
    return {
      originalQuery,
      resolvedQuery: cleanedQuery,
      usedConversationContext: false,
    };
  }

  try {
    const llm = new ChatOpenAI({
      model: getStageModel(model, "tool_planner"),
      apiKey,
    });

    const rewritten = await llm.withStructuredOutput(contextualQuerySchema).invoke(
      [
        {
          role: "system",
          content:
            "Rewrite ambiguous follow-up web-search requests into standalone search engine queries. " +
            "Use conversation history only to resolve references like pronouns or ellipsis. " +
            "Do not invent facts, and keep the query concise and explicit.",
        },
        {
          role: "user",
          content:
            `Conversation history:\n${history}\n\n` +
            `Latest search request:\n${cleanedQuery}\n\n` +
            "Return a standalone query with the subject made explicit. " +
            "If the latest request is already self-contained, keep it essentially unchanged.",
        },
      ],
      { signal: abortSignal }
    );

    const resolvedQuery = rewritten.rewrittenQuery.trim() || cleanedQuery;

    return {
      originalQuery,
      resolvedQuery,
      usedConversationContext:
        rewritten.usedConversationContext &&
        resolvedQuery.toLowerCase() !== cleanedQuery.toLowerCase(),
      rationale: rewritten.rationale,
    };
  } catch (error) {
    logger.warn("[Web Search Query Context] Failed to rewrite follow-up query:", error);
    return {
      originalQuery,
      resolvedQuery: cleanedQuery,
      usedConversationContext: false,
    };
  }
}
