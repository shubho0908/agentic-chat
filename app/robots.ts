import type { MetadataRoute } from "next";
import { appRoutePrefixes, appRoutes } from "@/lib/routes";
import { absoluteUrl, siteConfig } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: [appRoutes.home, appRoutes.privacy, appRoutes.terms],
        disallow: [
          appRoutePrefixes.api,
          appRoutePrefixes.conversation,
          appRoutePrefixes.settings,
          appRoutePrefixes.share,
        ],
      },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
    host: siteConfig.url,
  };
}
