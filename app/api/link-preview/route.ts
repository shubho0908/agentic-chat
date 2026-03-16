import { NextRequest, NextResponse } from "next/server";
import { headers } from 'next/headers';
import * as cheerio from "cheerio";
import { getAuthenticatedUser } from '@/lib/api-utils';
import { validateUrl } from '@/lib/url-scraper/scraper';
import { safeFetch } from '@/lib/network/safe-fetch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
  const { error } = await getAuthenticatedUser(await headers());
  if (error) return error;

  const url = request.nextUrl.searchParams.get("url");

  const validation = validateUrl(url || '');
  if (!validation.isValid) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  try {
    const response = await safeFetch(validation.url!.href, {
      timeoutMs: 10000,
      retries: 2,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; LinkPreviewBot/1.0)",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      throw new Error(`Unsupported content type: ${contentType}`);
    }

    const html = await response.text();
    const metadata = extractMetadata(html, validation.url!.href);

    return NextResponse.json(metadata, {
      headers: {
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json(
      { url: validation.url?.href || url || '', domain: extractDomain(validation.url?.href || url || '') },
      { status: 200 }
    );
  }
}
