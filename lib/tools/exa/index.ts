import Exa from "exa-js";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { dispatchCustomEvent } from "@langchain/core/callbacks/dispatch";
import { withRetry } from "@/lib/retry";
import { logger } from "@/lib/logger";
import { safeFetch } from "@/lib/network/safeFetch";
import { getCircuitBreaker, registerCircuitBreaker } from "@/lib/circuitBreaker";
import { ToolName } from "@/lib/tools/constants";
import { CustomEventName } from "@/lib/orchestrator/constants";

let exaClient: Exa | null = null;

const EXA_REQUEST_TIMEOUT_MS = 15_000;
const SERPER_SEARCH_URL = "https://google.serper.dev/search";
const SERPER_MAX_RESPONSE_BYTES = 512 * 1024;

const EXA_BREAKER_OPTIONS = { failureThreshold: 4, resetTimeoutMs: 30_000 } as const;
const SERPER_BREAKER_OPTIONS = { failureThreshold: 4, resetTimeoutMs: 30_000 } as const;

registerCircuitBreaker("exa", EXA_BREAKER_OPTIONS);
registerCircuitBreaker("serper", SERPER_BREAKER_OPTIONS);

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

export interface DeepSearchOptions {
  numResults?: number;
  maxCharacters?: number;
  signal?: AbortSignal;
}

interface SearchResult {
  title: string;
  url: string;
  text: string;
  publishedDate?: string;
  image?: string;
}

interface SerperOrganicResult {
  title?: string;
  link?: string;
  snippet?: string;
  date?: string;
  imageUrl?: string;
}

interface SerperResponse {
  organic?: SerperOrganicResult[];
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || /abort/i.test(error.message));
}

async function serperSearch(
  query: string,
  options: DeepSearchOptions = {}
): Promise<SearchResult[]> {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) {
    throw new Error("SERPER_API_KEY environment variable is not set");
  }

  const { numResults = 8, signal } = options;
  const response = await safeFetch(SERPER_SEARCH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": apiKey,
    },
    body: JSON.stringify({ q: query, num: numResults }),
    timeoutMs: EXA_REQUEST_TIMEOUT_MS,
    retries: 1,
    maxResponseBytes: SERPER_MAX_RESPONSE_BYTES,
    signal,
  });

  if (!response.ok) {
    throw new Error(`Serper returned HTTP ${response.status}`);
  }

  const data = (await response.json()) as SerperResponse;
  return (data.organic ?? [])
    .filter((result): result is Required<Pick<SerperOrganicResult, "link">> & SerperOrganicResult =>
      typeof result.link === "string" && result.link.length > 0
    )
    .slice(0, numResults)
    .map((result) => ({
      title: result.title || "Untitled",
      url: result.link,
      text: result.snippet ?? "",
      publishedDate: result.date,
      image: result.imageUrl,
    }));
}

const JUNK_IMAGE_PATTERNS = [
  /logo/i,
  /icon/i,
  /favicon/i,
  /avatar/i,
  /placeholder/i,
  /default/i,
  /blank\./i,
  /spacer/i,
  /pixel\./i,
  /1x1/i,
  /badge/i,
  /button/i,
  /banner-ad/i,
  /tracking/i,
  /analytics/i,
  /\.svg$/i,
  /\.gif$/i,
  /data:image/i,
  /gravatar\.com/i,
  /wp-content\/plugins/i,
];

function isLikelyContentImage(url: string): boolean {
  if (!url || !url.startsWith("http")) return false;
  return !JUNK_IMAGE_PATTERNS.some((p) => p.test(url));
}

function pickBestImage(result: Record<string, unknown>): string | undefined {
  // Prefer extras.imageLinks (actual in-page images) over og:image metadata
  const extras = result.extras as { imageLinks?: string[] } | undefined;
  if (extras?.imageLinks?.length) {
    const valid = extras.imageLinks.find(isLikelyContentImage);
    if (valid) return valid;
  }

  // Fall back to og:image only if it passes quality filter
  const ogImage = result.image as string | undefined;
  if (ogImage && isLikelyContentImage(ogImage)) return ogImage;

  return undefined;
}

export async function exaDeepSearch(
  query: string,
  options: DeepSearchOptions = {}
): Promise<SearchResult[]> {
  const { numResults = 8, maxCharacters = 3000 } = options;
  const exaBreaker = getCircuitBreaker("exa");
  const serperBreaker = getCircuitBreaker("serper");

  if (exaBreaker.canAttempt() && process.env.EXA_API_KEY) {
    try {
      const exa = getExaClient();
      const response = await withRetry(
        () =>
          exa.search(query, {
            type: "neural",
            numResults,
            contents: {
              text: { maxCharacters },
              highlights: true,
              extras: { imageLinks: 3 },
            },
          }),
        { retries: 2, initialDelayMs: 300, timeoutMs: EXA_REQUEST_TIMEOUT_MS, signal: options.signal }
      );

      exaBreaker.recordSuccess();
      return response.results.map((r) => ({
        title: (r as { title?: string | null }).title || "Untitled",
        url: r.url,
        text: (r as { text?: string }).text ?? (r as { highlights?: string[] }).highlights?.join("\n") ?? "",
        publishedDate: r.publishedDate ?? undefined,
        image: pickBestImage(r),
      }));
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }
      exaBreaker.recordFailure();
      logger.warn("[Exa Deep Search] Exa failed; trying Serper fallback:", error);
    }
  }

  if (serperBreaker.canAttempt() && process.env.SERPER_API_KEY) {
    try {
      const results = await serperSearch(query, options);
      serperBreaker.recordSuccess();
      return results;
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }
      serperBreaker.recordFailure();
      throw error;
    }
  }

  throw new Error("All search providers unavailable (circuit open or not configured)");
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
  name: ToolName.WEB_SEARCH,
  description:
    "Search the web for current information, news, research, documentation, etc. Use when you need up-to-date information not in your training data.",
  schema: exaSearchSchema,
  func: async ({ query, numResults = 5, category, includeDomains }, _runManager, config) => {
    const exaBreaker = getCircuitBreaker("exa");
    const serperBreaker = getCircuitBreaker("serper");

    if (exaBreaker.canAttempt() && process.env.EXA_API_KEY) {
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
                extras: { imageLinks: 3 },
              },
            }),
          { retries: 2, initialDelayMs: 300, timeoutMs: EXA_REQUEST_TIMEOUT_MS, signal: config?.signal }
        );

        if (!response.results.length) {
          exaBreaker.recordSuccess();
          return "No results found for this query.";
        }

        exaBreaker.recordSuccess();

        const seenImages = new Set<string>();
        const images: Array<{ url: string; description?: string }> = [];
        for (const r of response.results) {
          const imgUrl = pickBestImage(r as Record<string, unknown>);
          if (!imgUrl || seenImages.has(imgUrl)) continue;
          seenImages.add(imgUrl);
          images.push({ url: imgUrl, description: r.title ?? undefined });
        }
        if (images.length > 0) {
          await dispatchCustomEvent(CustomEventName.SEARCH_IMAGES, { images });
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
        if (isAbortError(error)) {
          throw error;
        }
        exaBreaker.recordFailure();
        logger.warn("[Exa Search] Exa failed; trying Serper fallback:", error);
      }
    }

    if (serperBreaker.canAttempt() && process.env.SERPER_API_KEY) {
      try {
        const fallbackResults = await serperSearch(query, { numResults, signal: config?.signal });
        serperBreaker.recordSuccess();
        if (!fallbackResults.length) {
          return "No results found for this query.";
        }
        return fallbackResults
          .map((r, i) => `[${i + 1}] ${r.title || "Untitled"}\nURL: ${r.url}\n${r.text.slice(0, 800)}`)
          .join("\n\n---\n\n");
      } catch (fallbackError) {
        if (isAbortError(fallbackError)) {
          throw fallbackError;
        }
        serperBreaker.recordFailure();
        logger.error("[Serper Search] Failed:", fallbackError);
      }
    }

    return "Web search failed: all search providers are unavailable. I'll answer based on my existing knowledge.";
  },
});
