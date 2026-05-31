import type { Metadata } from "next";
import { appBaseUrl } from "@/lib/appUrl";
import { apiRoutes } from "@/lib/routes";

export const siteConfig = {
  name: "Agentic Chat",
  defaultTitle: "Agentic Chat — AI-Powered Research, Documents & Workflow Automation",
  description:
    "Your AI workspace that researches, reads documents, remembers context, and connects to the tools you already use. One chat to rule them all.",
  fullDescription:
    "Agentic Chat combines intelligent query routing, RAG-powered document analysis, persistent memory, deep research, and native integrations with Gmail, Drive, Slack, Notion, GitHub, and Linear into a single AI workspace.",
  defaultOgImagePath: apiRoutes.ogHome,
  url: appBaseUrl,
  locale: "en_US",
  contactEmail: "dev@shubhojeet.com",
  githubUrl: "https://github.com/shubho0908/agentic-chat",
  category: "technology",
  classification: "AI productivity software",
  defaultKeywords: [
    "AI chat app",
    "AI assistant",
    "multi-modal AI",
    "intelligent routing",
    "RAG document chat",
    "AI with memory",
    "deep research AI",
    "web search AI",
    "Google Workspace AI",
    "third-party integrations",
    "AI workflow automation",
    "Agentic Chat",
  ],
} as const;

export const homepageKeywords = [
  "AI search assistant",
  "chat with documents",
  "Gmail Drive Docs Sheets assistant",
  "context-aware AI",
  "semantic caching",
  "multi-model AI",
  "human-in-the-loop AI",
  "Slack Notion GitHub integration",
];

export const indexRobots: NonNullable<Metadata["robots"]> = {
  index: true,
  follow: true,
  googleBot: {
    index: true,
    follow: true,
    "max-image-preview": "large",
    "max-video-preview": -1,
    "max-snippet": -1,
  },
};

export const noIndexRobots: NonNullable<Metadata["robots"]> = {
  index: false,
  follow: false,
  nocache: true,
  googleBot: {
    index: false,
    follow: false,
    noimageindex: true,
    "max-image-preview": "none",
    "max-video-preview": 0,
    "max-snippet": 0,
  },
};

export function absoluteUrl(path = "/") {
  return new URL(path, siteConfig.url).toString();
}

function getFullTitle(title: string) {
  return title === siteConfig.defaultTitle ? title : `${title} | ${siteConfig.name}`;
}

type CreatePageMetadataOptions = {
  title: string;
  description: string;
  path: string;
  keywords?: readonly string[];
  imagePath?: string;
  noIndex?: boolean;
  absoluteTitle?: boolean;
  type?: "website" | "article";
  publishedTime?: string;
  modifiedTime?: string;
  section?: string;
};

export function createPageMetadata({
  title,
  description,
  path,
  keywords = [],
  imagePath = siteConfig.defaultOgImagePath,
  noIndex = false,
  absoluteTitle = false,
  type = "website",
  publishedTime,
  modifiedTime,
  section,
}: CreatePageMetadataOptions): Metadata {
  const fullTitle = getFullTitle(title);
  const imageUrl = imagePath.startsWith("http") ? imagePath : absoluteUrl(imagePath);
  const uniqueKeywords = Array.from(new Set([...siteConfig.defaultKeywords, ...keywords]));
  const articleMetadata =
    type === "article"
      ? {
          publishedTime,
          modifiedTime,
          section,
          tags: uniqueKeywords,
        }
      : undefined;

  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    keywords: uniqueKeywords,
    category: siteConfig.category,
    classification: siteConfig.classification,
    alternates: {
      canonical: path,
    },
    openGraph: {
      title: fullTitle,
      description,
      url: path,
      siteName: siteConfig.name,
      images: [
        {
          url: imageUrl,
          width: 1200,
          height: 630,
          alt: fullTitle,
        },
      ],
      locale: siteConfig.locale,
      type,
      ...articleMetadata,
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description,
      images: [imageUrl],
    },
    robots: noIndex ? noIndexRobots : indexRobots,
  };
}

export function createWebPageSchema({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: title,
    description,
    url: absoluteUrl(path),
    isPartOf: {
      "@type": "WebSite",
      name: siteConfig.name,
      url: siteConfig.url,
    },
  };
}

export function createBreadcrumbSchema(
  items: Array<{ name: string; path: string }>,
) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}
