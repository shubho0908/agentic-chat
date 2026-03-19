import type { Metadata } from "next";
import { appBaseUrl } from "@/lib/appUrl";

export const siteConfig = {
  name: "Agentic Chat",
  defaultTitle: "Agentic Chat AI Chat App with Web Search, Memory, and Tools",
  description:
    "Agentic Chat is an AI chat app for web search, document analysis, memory, and Google Workspace workflows.",
  fullDescription:
    "Agentic Chat is an AI chat app for web search, document analysis, long-running context, and Google Workspace workflows, with optional bring-your-own-key control.",
  defaultOgImagePath: "/api/og/home",
  url: appBaseUrl,
  locale: "en_US",
  contactEmail: "dev@shubhojeet.com",
  githubUrl: "https://github.com/shubho0908/agentic-chat",
  defaultKeywords: [
    "AI chat app",
    "AI assistant",
    "web search AI",
    "document chat",
    "AI with memory",
    "Google Workspace AI",
    "bring your own key AI",
    "research assistant",
    "knowledge assistant",
    "Agentic Chat",
  ],
} as const;

export const homepageKeywords = [
  "AI search assistant",
  "chat with documents",
  "AI research workflow",
  "Gmail Drive Docs Sheets assistant",
  "context-aware AI",
];

export const homepageFaqs = [
  {
    question: "What is Agentic Chat?",
    answer:
      "Agentic Chat is a web-based AI chat app that combines conversation memory, web search, document understanding, and optional Google Workspace access in one workflow.",
  },
  {
    question: "Can Agentic Chat search the web and analyze files?",
    answer:
      "Yes. You can search the web, upload documents, and keep both sources in the same conversation so follow-up prompts stay grounded in the material you already gathered.",
  },
  {
    question: "Does Agentic Chat support Google Workspace?",
    answer:
      "Yes. The product includes optional Google Workspace connections for tools like Gmail, Drive, Calendar, Docs, Sheets, and Slides when those integrations help with the task.",
  },
  {
    question: "Can I use my own API key?",
    answer:
      "Yes. Agentic Chat supports bring-your-own-key workflows so access and billing can remain under your control when you prefer that setup.",
  },
] as const;

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
}: CreatePageMetadataOptions): Metadata {
  const fullTitle = getFullTitle(title);
  const imageUrl = imagePath.startsWith("http") ? imagePath : absoluteUrl(imagePath);

  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    keywords: Array.from(new Set([...siteConfig.defaultKeywords, ...keywords])),
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
