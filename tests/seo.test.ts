import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeOrigin,
  resolveAppBaseUrl,
  resolveTrustedOrigins,
} from "@/lib/appUrl";
import {
  absoluteUrl,
  createBreadcrumbSchema,
  createPageMetadata,
  siteConfig,
} from "@/lib/seo";

test("normalizes origins with or without a scheme", () => {
  assert.equal(normalizeOrigin("https://example.com/path"), "https://example.com");
  assert.equal(normalizeOrigin("preview.example.com"), "https://preview.example.com");
  assert.equal(normalizeOrigin(""), null);
});

test("prefers stable production origins for app base URLs", () => {
  assert.equal(
    resolveAppBaseUrl({
      NODE_ENV: "production",
      VERCEL_PROJECT_PRODUCTION_URL: "agentic-chat.app",
      VERCEL_URL: "preview-agentic-chat.vercel.app",
    }),
    "https://agentic-chat.app",
  );
});

test("collects trusted origins without duplicates", () => {
  assert.deepEqual(
    resolveTrustedOrigins({
      NODE_ENV: "production",
      NEXT_PUBLIC_APP_URL: "https://agentic-chat.app",
      BETTER_AUTH_URL: "https://agentic-chat.app/auth",
      VERCEL_URL: "preview-agentic-chat.vercel.app",
    }),
    [
      "https://agentic-chat.app",
      "https://preview-agentic-chat.vercel.app",
      "http://localhost:3000",
      "http://127.0.0.1:3000",
    ],
  );
});

test("creates canonical metadata with article signals when requested", () => {
  const metadata = createPageMetadata({
    title: "Privacy Policy",
    description: "How data is handled.",
    path: "/privacy",
    keywords: ["privacy policy"],
    type: "article",
    modifiedTime: "2026-03-18T00:00:00.000Z",
    publishedTime: "2026-03-18T00:00:00.000Z",
    section: "Legal",
  });
  const openGraph = metadata.openGraph as {
    type?: string;
    publishedTime?: string;
    section?: string;
  };

  assert.equal(metadata.alternates?.canonical, "/privacy");
  assert.equal(metadata.category, siteConfig.category);
  assert.equal(metadata.classification, siteConfig.classification);
  assert.equal(openGraph.type, "article");
  assert.equal(openGraph.publishedTime, "2026-03-18T00:00:00.000Z");
  assert.equal(openGraph.section, "Legal");
});

test("builds breadcrumb schema with absolute item URLs", () => {
  const schema = createBreadcrumbSchema([
    { name: "Home", path: "/" },
    { name: "Terms", path: "/terms" },
  ]);

  assert.equal(schema.itemListElement[0].item, absoluteUrl("/"));
  assert.equal(schema.itemListElement[1].item, absoluteUrl("/terms"));
});
