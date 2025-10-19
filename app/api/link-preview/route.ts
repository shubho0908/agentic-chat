import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";

interface LinkMetadata {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  favicon?: string;
  siteName?: string;
  domain: string;
}

const extractDomain = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

const getMetaContent = ($: cheerio.CheerioAPI, selectors: string[]): string | undefined => {
  for (const selector of selectors) {
    const content = $(selector).attr("content");
    if (content) return content;
  }
  return undefined;
};

const extractMetadata = (html: string, url: string): LinkMetadata => {
  const $ = cheerio.load(html);
  const domain = extractDomain(url);
  const urlOrigin = new URL(url).origin;

  const title = getMetaContent($, [
    'meta[property="og:title"]',
    'meta[name="twitter:title"]',
  ]) || $("title").text().trim() || undefined;

  const description = getMetaContent($, [
    'meta[property="og:description"]',
    'meta[name="twitter:description"]',
    'meta[name="description"]',
  ]);

  const image = getMetaContent($, [
    'meta[property="og:image"]',
    'meta[name="twitter:image"]',
    'meta[property="og:image:url"]',
  ]);

  const siteName = getMetaContent($, ['meta[property="og:site_name"]']) || domain;

  const faviconHref = ['link[rel="icon"]', 'link[rel="shortcut icon"]', 'link[rel="apple-touch-icon"]']
    .map(sel => $(sel).attr("href"))
    .find(Boolean);

  const favicon = faviconHref 
    ? new URL(faviconHref, url).href 
    : `${urlOrigin}/favicon.ico`;

  return {
    url,
    domain,
    title,
    description: description && description.length > 200 
      ? `${description.substring(0, 197)}...` 
      : description,
    image,
    favicon,
    siteName,
  };
};

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "URL parameter is required" }, { status: 400 });
  }

  try {
    const validUrl = new URL(url);
    if (!["http:", "https:"].includes(validUrl.protocol)) {
      return NextResponse.json({ error: "Invalid URL protocol" }, { status: 400 });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(validUrl.href, {
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; LinkPreviewBot/1.0)",
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const html = await response.text();
      const metadata = extractMetadata(html, url);

      return NextResponse.json(metadata, {
        headers: {
          "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
        },
      });
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    console.error("Link preview error:", error);
    return NextResponse.json(
      { url, domain: extractDomain(url) },
      { status: 200 }
    );
  }
}
