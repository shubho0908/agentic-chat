import { NextRequest, NextResponse } from "next/server";
import { headers } from 'next/headers';
import { getAuthenticatedUser } from '@/lib/apiUtils';
import { scrapeUrl, validateUrl } from '@/lib/url-scraper/scraper';


import { logger } from "@/lib/logger";
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
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    logger.error("[URL Scraper API] Error:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to scrape URL",
      },
      { status: 500 }
    );
  }
}
