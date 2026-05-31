import { absoluteUrl, siteConfig } from "@/lib/seo";
import { appRoutePrefixes, appRoutes } from "@/lib/routes";

export function GET() {
  const body = [
    "User-agent: *",
    `Allow: ${appRoutes.home}`,
    `Allow: ${appRoutes.privacy}`,
    `Allow: ${appRoutes.terms}`,
    `Disallow: ${appRoutePrefixes.api}`,
    `Disallow: ${appRoutePrefixes.conversation}`,
    `Disallow: ${appRoutePrefixes.settings}`,
    `Disallow: ${appRoutePrefixes.share}`,
    "",
    `Sitemap: ${absoluteUrl("/sitemap.xml")}`,
    `Host: ${siteConfig.url}`,
    "",
    "# Content Signals (draft-romm-aipref-contentsignals)",
    "# https://contentsignals.org/",
    "Content-Signal: ai-train=no, search=yes, ai-input=no",
  ].join("\n");

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
