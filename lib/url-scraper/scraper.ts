import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import * as cheerio from "cheerio";
import { safeFetch } from '@/lib/network/safeFetch';
import { logError, logInfo } from '@/lib/observability';
import { logger } from "@/lib/logger";

interface ScrapedLink {
  url: string;
  text: string;
}

interface ScrapedContent {
  url: string;
  title?: string;
  content: string;
  textContent: string;
  excerpt?: string;
  byline?: string;
  siteName?: string;
  publishedTime?: string;
  links?: ScrapedLink[];
}

const MAX_EXTRACTED_LINKS = 50;

export function extractLinks(html: string, baseUrl: string, max = MAX_EXTRACTED_LINKS): ScrapedLink[] {
  try {
    const $ = cheerio.load(html);
    const seen = new Set<string>();
    const links: ScrapedLink[] = [];
    $("a[href]").each((_, el) => {
      if (links.length >= max) return false;
      const href = $(el).attr("href");
      if (!href) return;
      let abs: URL;
      try {
        abs = new URL(href, baseUrl);
      } catch {
        return;
      }
      if (!["http:", "https:"].includes(abs.protocol)) return;
      abs.hash = "";
      const key = abs.toString();
      if (seen.has(key)) return;
      seen.add(key);
      links.push({ url: key, text: $(el).text().replace(/\s+/g, " ").trim().slice(0, 100) });
    });
    return links;
  } catch {
    return [];
  }
}

export function formatLinksAsMarkdown(links: ScrapedLink[], max: number, indent = ""): string {
  return links
    .slice(0, max)
    .map((link) => (link.text ? `${indent}- [${link.text}](${link.url})` : `${indent}- ${link.url}`))
    .join("\n");
}

const MAX_CONTENT_LENGTH = 6000;
const REQUEST_TIMEOUT = 10000;
const MAX_SCRAPE_RESPONSE_BYTES = 5 * 1024 * 1024;

interface ScrapeRequestOptions {
  timeoutMs?: number;
  retries?: number;
}

function getPositiveFiniteNumber(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

function getNonNegativeInteger(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : fallback;
}

export function validateUrl(url: string): { isValid: boolean; url?: URL; error?: string } {
  if (!url || typeof url !== "string") {
    return { isValid: false, error: "URL is required" };
  }

  try {
    const validUrl = new URL(url);
    if (!["http:", "https:"].includes(validUrl.protocol)) {
      return { isValid: false, error: "Invalid URL protocol. Only HTTP and HTTPS are supported." };
    }
    return { isValid: true, url: validUrl };
  } catch {
    return { isValid: false, error: "Invalid URL format" };
  }
}

function extractWithReadability(html: string, url: string): ScrapedContent | null {
  try {
    const { document } = parseHTML(html);
    const reader = new Readability(document, {
      charThreshold: 100,
    });
    const article = reader.parse();

    if (!article || !article.textContent) return null;

    const textContent = article.textContent.trim();
    if (!textContent || textContent.length < 100) return null;

    return {
      url,
      title: article.title || undefined,
      content: article.content || '',
      textContent: textContent.substring(0, MAX_CONTENT_LENGTH),
      excerpt: article.excerpt || undefined,
      byline: article.byline || undefined,
      siteName: article.siteName || undefined,
      publishedTime: article.publishedTime || undefined,
      links: extractLinks(html, url),
    };
  } catch (error) {
    logger.error("[Readability] Extraction failed:", error);
    return null;
  }
}

function extractWithCheerio(html: string, url: string): ScrapedContent {
  const $ = cheerio.load(html);

  const links = extractLinks(html, url);

  $("script, style, noscript, iframe, nav, footer, header, aside, .ad, .advertisement, .cookie-banner").remove();

  const mainSelectors = [
    "main",
    "article",
    '[role="main"]',
    ".main-content",
    "#main-content",
    ".content",
    "#content",
    ".post-content",
    ".article-content",
    ".entry-content",
  ];

  let contentElement = null;
  for (const selector of mainSelectors) {
    const elem = $(selector).first();
    if (elem.length && elem.text().trim().length > 200) {
      contentElement = elem;
      break;
    }
  }

  const textContent = contentElement
    ? contentElement.text().replace(/\s+/g, " ").trim()
    : $("body").text().replace(/\s+/g, " ").trim();

  const title = $("title").text().trim() ||
    $('meta[property="og:title"]').attr("content") ||
    $("h1").first().text().trim() ||
    undefined;

  const description = $('meta[name="description"]').attr("content") ||
    $('meta[property="og:description"]').attr("content") ||
    undefined;

  const siteName = $('meta[property="og:site_name"]').attr("content") || undefined;

  return {
    url,
    title,
    content: textContent.substring(0, MAX_CONTENT_LENGTH),
    textContent: textContent.substring(0, MAX_CONTENT_LENGTH),
    excerpt: description,
    siteName,
    links,
  };
}

async function scrapeUrlCore(url: string, options: ScrapeRequestOptions = {}): Promise<ScrapedContent> {
  logInfo({ event: 'url_scrape_start', url });
  const timeoutMs = getPositiveFiniteNumber(options.timeoutMs, REQUEST_TIMEOUT);
  const retries = getNonNegativeInteger(options.retries, 2);

  try {
    const response = await safeFetch(url, {
      timeoutMs,
      retries,
      maxResponseBytes: MAX_SCRAPE_RESPONSE_BYTES,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      throw new Error(`Unsupported content type: ${contentType}`);
    }

    const html = await response.text();

    const readabilityResult = extractWithReadability(html, url);
    if (readabilityResult && readabilityResult.textContent.length > 500) {
      logInfo({
        event: 'url_scrape_complete',
        url,
        contentLength: readabilityResult.textContent.length,
      });
      return readabilityResult;
    }

    const cheerioResult = extractWithCheerio(html, url);
    logInfo({
      event: 'url_scrape_complete',
      url,
      contentLength: cheerioResult.textContent.length,
    });
    return cheerioResult;
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        logError({ event: 'url_scrape_timeout', url, error: error.message });
        throw new Error("Request timeout - the website took too long to respond");
      }
      logError({ event: 'url_scrape_failed', url, error: error.message });
      throw new Error(`Failed to scrape URL: ${error.message}`);
    }
    logError({ event: 'url_scrape_failed', url, error: 'Unknown error' });
    throw new Error("Failed to scrape URL: Unknown error");
  }
}

export async function scrapeUrl(url: string, options: ScrapeRequestOptions = {}): Promise<ScrapedContent> {
  return scrapeUrlCore(url, options);
}

