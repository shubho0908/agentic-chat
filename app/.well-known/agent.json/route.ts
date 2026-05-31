import { NextResponse } from "next/server";
import { siteConfig, absoluteUrl } from "@/lib/seo";

export function GET() {
  return NextResponse.json({
    name: siteConfig.name,
    description: siteConfig.description,
    url: siteConfig.url,
    documentation_url: absoluteUrl("/docs/DNS-AID.md"),
    robots_url: absoluteUrl("/robots.txt"),
    sitemap_url: absoluteUrl("/sitemap.xml"),
    capabilities: {
      markdown_negotiation: true,
      content_signals: true,
    },
  });
}
