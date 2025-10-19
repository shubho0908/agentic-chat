import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import * as cheerio from "cheerio";
import { unstable_cache } from 'next/cache';

export interface ScrapedContent {
  url: string;
  title?: string;
  content: string;
  textContent: string;
  excerpt?: string;
  byline?: string;
  siteName?: string;
  publishedTime?: string;
}

const MAX_CONTENT_LENGTH = 50000;
const REQUEST_TIMEOUT = 10000;

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
    };
  } catch (error) {
    console.error("[Readability] Extraction failed:", error);
    return null;
  }
}

function extractWithCheerio(html: string, url: string): ScrapedContent {
  const $ = cheerio.load(html);

  // Remove script, style, and other non-content elements
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
  };
}

async function scrapeUrlCore(url: string): Promise<ScrapedContent> {
  console.log(`[URL Scraper] Fetching: ${url}`);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    clearTimeout(timeoutId);

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
      console.log(`[URL Scraper] Successfully scraped: ${url} (${readabilityResult.textContent.length} chars)`);
      return readabilityResult;
    }

    const cheerioResult = extractWithCheerio(html, url);
    console.log(`[URL Scraper] Successfully scraped: ${url} (${cheerioResult.textContent.length} chars)`);
    return cheerioResult;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error) {
      if (error.name === "AbortError") {
        console.error(`[URL Scraper] Timeout for: ${url}`);
        throw new Error("Request timeout - the website took too long to respond");
      }
      console.error(`[URL Scraper] Failed to scrape ${url}:`, error.message);
      throw new Error(`Failed to scrape URL: ${error.message}`);
    }
    console.error(`[URL Scraper] Failed to scrape ${url}: Unknown error`);
    throw new Error("Failed to scrape URL: Unknown error");
  }
}

const getCachedScrapedContent = unstable_cache(
  async (url: string) => scrapeUrlCore(url),
  ['url-scraper'],
  {
    revalidate: 3600, // 1 hour
    tags: ['url-scrape'],
  }
);

export async function scrapeUrl(url: string): Promise<ScrapedContent> {
  return getCachedScrapedContent(url);
}

const URL_REGEX = /https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&\/=]*)/gi;

const EXCLUDED_EXTENSIONS = /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico|mp4|mp3|wav|pdf|zip|tar|gz)$/i;

const EXCLUDED_PATTERNS = [
  /cdn\./i,
  /static\./i,
  /assets\./i,
  /\.cloudinary\./i,
  /\.imgur\./i,
];

export function extractUrlsFromMessage(message: string | Array<{ type: string; text?: string }>): string[] {
  const textContent = typeof message === 'string' 
    ? message 
    : message.filter(p => p.type === 'text' && p.text).map(p => p.text || '').join(' ');

  const matches = textContent.match(URL_REGEX);
  if (!matches) return [];

  const validUrls = matches.filter(url => {
    if (EXCLUDED_EXTENSIONS.test(url)) return false;
    if (EXCLUDED_PATTERNS.some(pattern => pattern.test(url))) return false;
    
    try {
      const parsed = new URL(url);
      return ['http:', 'https:'].includes(parsed.protocol);
    } catch {
      return false;
    }
  });

  return Array.from(new Set(validUrls));
}

const MAX_URLS_TO_SCRAPE = 5;

export async function scrapeMultipleUrls(urls: string[]): Promise<ScrapedContent[]> {
  const urlsToProcess = urls.slice(0, MAX_URLS_TO_SCRAPE);
  
  console.log(`[URL Scraper] Detected ${urls.length} URL(s), processing ${urlsToProcess.length}`);
  if (urls.length > MAX_URLS_TO_SCRAPE) {
    console.log(`[URL Scraper] Skipping ${urls.length - MAX_URLS_TO_SCRAPE} URL(s) due to limit`);
  }
  
  urlsToProcess.forEach((url, index) => {
    console.log(`[URL Scraper] ${index + 1}. ${url}`);
  });

  const results = await Promise.allSettled(
    urlsToProcess.map(url => scrapeUrl(url))
  );

  const successful = results.filter(
    (result): result is PromiseFulfilledResult<ScrapedContent> => result.status === 'fulfilled'
  );
  
  const failed = results.filter(result => result.status === 'rejected');
  
  console.log(`[URL Scraper] Successfully scraped ${successful.length}/${urlsToProcess.length} URL(s)`);
  if (failed.length > 0) {
    console.log(`[URL Scraper] Failed to scrape ${failed.length} URL(s)`);
    failed.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.error(`[URL Scraper] Failed URL ${index + 1}:`, result.reason);
      }
    });
  }

  return successful.map(result => result.value);
}

export function formatScrapedContentForContext(scrapedContent: ScrapedContent[]): string {
  if (scrapedContent.length === 0) return '';

  const formatted = scrapedContent.map((content, index) => {
    const parts = [
      `\n\n--- Web Content ${index + 1} ---`,
      `URL: ${content.url}`,
    ];

    if (content.title) {
      parts.push(`Title: ${content.title}`);
    }

    if (content.byline) {
      parts.push(`Author: ${content.byline}`);
    }

    if (content.siteName) {
      parts.push(`Source: ${content.siteName}`);
    }

    if (content.publishedTime) {
      parts.push(`Published: ${content.publishedTime}`);
    }

    if (content.excerpt) {
      parts.push(`\nSummary: ${content.excerpt}`);
    }

    parts.push(`\nContent:\n${content.textContent}`);
    parts.push(`--- End of Web Content ${index + 1} ---\n`);

    return parts.join('\n');
  }).join('\n');

  return `\n\n<WEB_CONTENT>\nThe user has provided URLs in their message. Below is the scraped content from these web pages:\n${formatted}\n</WEB_CONTENT>\n`;
}
