import { NextRequest, NextResponse } from "next/server";
import { headers } from 'next/headers';
import { getAuthenticatedUser } from '@/lib/api-utils';
import { scrapeUrl, validateUrl } from '@/lib/url-scraper/scraper';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { error } = await getAuthenticatedUser(await headers());
    if (error) return error;

    const body = await request.json();
    const { url } = body;

    const validation = validateUrl(url);
    if (!validation.isValid) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      );
    }

    const result = await scrapeUrl(validation.url!.href);

    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    console.error("[URL Scraper API] Error:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to scrape URL",
      },
      { status: 500 }
    );
  }
}
