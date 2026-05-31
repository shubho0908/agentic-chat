import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import Firecrawl from "@mendable/firecrawl-js";
import { scrapeUrl, validateUrl } from "@/lib/url-scraper/scraper";
import { logger } from "@/lib/logger";
import { ToolName } from "@/lib/tools/constants";

const MAX_CONTENT_LENGTH = 3000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const FIRECRAWL_TIMEOUT_MS = 15000;
const JINA_TIMEOUT_MS = 10000;

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
  return header + result.textContent;
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

export const webScrapeTool = new DynamicStructuredTool({
  name: ToolName.WEB_SCRAPE,
  description:
    "Extract content from a specific URL. Use when you need to read a webpage's full content.",
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
