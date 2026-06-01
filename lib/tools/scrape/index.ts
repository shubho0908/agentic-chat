import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import Firecrawl from "@mendable/firecrawl-js";
import { scrapeUrl, validateUrl, formatLinksAsMarkdown } from "@/lib/url-scraper/scraper";
import { logger } from "@/lib/logger";
import { ToolName } from "@/lib/tools/constants";

const MAX_CONTENT_LENGTH = 3000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const FIRECRAWL_TIMEOUT_MS = 15000;
const JINA_TIMEOUT_MS = 10000;
const MAX_CRAWL_PAGES = 10;
const MAX_CRAWL_DEPTH = 3;
const CRAWL_PAGE_TIMEOUT_MS = 8000;

let firecrawlClient: Firecrawl | null = null;

function getFirecrawlClient(): Firecrawl | null {
  if (firecrawlClient) return firecrawlClient;
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) return null;
  firecrawlClient = new Firecrawl({ apiKey });
  return firecrawlClient;
}

function truncate(text: string): string {
  if (text.length <= MAX_CONTENT_LENGTH) return text;
  return text.slice(0, MAX_CONTENT_LENGTH) + "\n\n[Content truncated]";
}

async function readBoundedText(response: Response): Promise<string> {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
    throw new Error(`Response too large: ${contentLength} bytes`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_RESPONSE_BYTES) {
        throw new Error(`Response exceeded ${MAX_RESPONSE_BYTES} bytes`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const decoder = new TextDecoder();
  return chunks.map((c) => decoder.decode(c, { stream: true })).join("") + decoder.decode();
}

async function tier1Scrape(url: string): Promise<string> {
  const result = await scrapeUrl(url, { timeoutMs: 8000, retries: 1 });
  if (!result.textContent || result.textContent.length < 100) {
    throw new Error("Tier 1: insufficient content extracted");
  }
  const header = result.title ? `# ${result.title}\n\n` : "";
  const links = result.links?.length
    ? `\n\n## Links found on this page\n${formatLinksAsMarkdown(result.links, 30)}`
    : "";

  const TRUNCATION_SUFFIX_MARGIN = 32;
  const bodyBudget = Math.max(
    0,
    MAX_CONTENT_LENGTH - header.length - links.length - TRUNCATION_SUFFIX_MARGIN
  );
  const body =
    result.textContent.length > bodyBudget
      ? `${result.textContent.slice(0, bodyBudget)}\n\n[Content truncated]`
      : result.textContent;

  return header + body + links;
}

async function tier2Scrape(url: string): Promise<string> {
  const client = getFirecrawlClient();
  if (!client) throw new Error("Tier 2: FIRECRAWL_API_KEY not configured");

  const doc = await client.scrape(url, {
    formats: ["markdown"],
    timeout: FIRECRAWL_TIMEOUT_MS,
  });
  const content = doc.markdown ?? "";
  if (content.length < 100) {
    throw new Error("Tier 2: insufficient content from Firecrawl");
  }
  return content;
}

async function tier3Scrape(url: string): Promise<string> {
  const response = await fetch(`https://r.jina.ai/${url}`, {
    headers: { Accept: "text/plain" },
    signal: AbortSignal.timeout(JINA_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Tier 3: Jina returned ${response.status}`);
  }
  const content = await readBoundedText(response);
  if (content.length < 100) {
    throw new Error("Tier 3: insufficient content from Jina");
  }
  return content;
}

const webScrapeSchema = z.object({
  url: z.string().url().describe("The URL to scrape content from"),
});

export async function scrapeContent(url: string): Promise<string> {
  const validation = validateUrl(url);
  if (!validation.isValid) return "";

  const tiers = [
    { name: "fetch+readability", fn: () => tier1Scrape(url) },
    { name: "firecrawl", fn: () => tier2Scrape(url) },
    { name: "jina", fn: () => tier3Scrape(url) },
  ];

  for (const tier of tiers) {
    try {
      return truncate(await tier.fn());
    } catch (error) {
      logger.warn(`[WebScrape] ${tier.name} failed for ${url}: ${error instanceof Error ? error.message : "unknown"}`);
    }
  }
  return "";
}

export const webScrapeTool = new DynamicStructuredTool({
  name: ToolName.WEB_SCRAPE,
  description:
    "Extract the full content of a SINGLE webpage URL, including a list of hyperlinks found on that page. Use to read one page or to discover links to follow. To explore a whole site across multiple pages, use web_crawl instead.",
  schema: webScrapeSchema,
  func: async ({ url }) => {
    const validation = validateUrl(url);
    if (!validation.isValid) {
      return `Invalid URL: ${validation.error}`;
    }

    const tiers = [
      { name: "fetch+readability", fn: () => tier1Scrape(url) },
      { name: "firecrawl", fn: () => tier2Scrape(url) },
      { name: "jina", fn: () => tier3Scrape(url) },
    ];

    for (const tier of tiers) {
      try {
        const content = await tier.fn();
        return truncate(content);
      } catch (error) {
        logger.warn(
          `[WebScrape] ${tier.name} failed for ${url}: ${error instanceof Error ? error.message : "unknown"}`
        );
      }
    }

    return `Failed to extract content from ${url}. The page may be heavily protected or unavailable.`;
  },
});

const webCrawlSchema = z.object({
  url: z.url().describe("The starting URL to crawl from"),
  maxPages: z
    .number()
    .int()
    .min(1)
    .max(MAX_CRAWL_PAGES)
    .optional()
    .default(5)
    .describe(`Maximum pages to fetch (1-${MAX_CRAWL_PAGES})`),
  maxDepth: z
    .number()
    .int()
    .min(1)
    .max(MAX_CRAWL_DEPTH)
    .optional()
    .default(2)
    .describe(`How many link-hops deep to follow (1-${MAX_CRAWL_DEPTH})`),
  sameOriginOnly: z
    .boolean()
    .optional()
    .default(true)
    .describe("Only follow links on the same origin as the start URL"),
});

export const webCrawlTool = new DynamicStructuredTool({
  name: ToolName.WEB_CRAWL,
  description:
    "Recursively crawl a website starting from a URL: fetches the page, follows its hyperlinks breadth-first, and returns the content and links of every visited page. Use when the user wants to map out a site, find pages across a domain, or collect links/projects spread over multiple pages — not just read one page.",
  schema: webCrawlSchema,
  func: async ({ url, maxPages = 5, maxDepth = 2, sameOriginOnly = true }, _runManager, config) => {
    const validation = validateUrl(url);
    if (!validation.isValid || !validation.url) {
      return `Invalid URL: ${validation.error}`;
    }

    const signal = config?.signal;
    const pageCap = Math.min(maxPages, MAX_CRAWL_PAGES);
    const depthCap = Math.min(maxDepth, MAX_CRAWL_DEPTH);
    const origin = validation.url.origin;
    const start = validation.url.href.split("#")[0];
    const seen = new Set<string>([start]);
    const queue: Array<{ url: string; depth: number }> = [{ url: start, depth: 0 }];
    const pages: string[] = [];

    while (queue.length > 0 && pages.length < pageCap) {
      if (signal?.aborted) break;
      const { url: current, depth } = queue.shift()!;

      let result;
      try {
        result = await scrapeUrl(current, { timeoutMs: CRAWL_PAGE_TIMEOUT_MS, retries: 0 });
      } catch (error) {
        logger.warn(`[WebCrawl] Failed ${current}: ${error instanceof Error ? error.message : "unknown"}`);
        continue;
      }

      const links = result.links ?? [];
      const linkList = formatLinksAsMarkdown(links, 20, "  ");
      pages.push(
        `### Page ${pages.length + 1}: ${result.title ?? current}\nURL: ${current}\n${result.textContent.slice(0, 1200)}${
          linkList ? `\nLinks:\n${linkList}` : ""
        }`
      );

      if (depth < depthCap) {
        for (const link of links) {
          const target = link.url.split("#")[0];
          if (seen.has(target)) continue;

          let targetUrl: URL;
          try {
            targetUrl = new URL(target);
          } catch {
            continue;
          }
          if (sameOriginOnly && targetUrl.origin !== origin) continue;

          seen.add(target);
          queue.push({ url: targetUrl.href, depth: depth + 1 });
        }
      }
    }

    if (pages.length === 0) {
      return `Failed to crawl ${url}. The site may be unreachable or protected.`;
    }

    return `Crawled ${pages.length} page(s) from ${origin} (depth ≤ ${depthCap}):\n\n${pages.join("\n\n---\n\n")}`;
  },
});
