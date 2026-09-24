import type { Metadata } from "next";
import { headers } from "next/headers";
import { Suspense } from "react";
import { Loader } from "lucide-react";
import { LandingEntry } from "@/components/landingEntry";
import { JsonLd } from "@/components/seo/jsonLd";
import { HomeContent } from "@/components/homeContent";
import { auth } from "@/lib/auth";
import {
  absoluteUrl,
  createPageMetadata,
  homepageKeywords,
  siteConfig,
} from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: siteConfig.defaultTitle,
  description: siteConfig.fullDescription,
  path: "/",
  keywords: homepageKeywords,
  absoluteTitle: true,
});

const homeStructuredData = [
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: siteConfig.name,
    description: siteConfig.description,
    url: siteConfig.url,
    inLanguage: "en-US",
  },
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: siteConfig.name,
    url: siteConfig.url,
    email: siteConfig.contactEmail,
    logo: absoluteUrl("/icon"),
    sameAs: [siteConfig.githubUrl],
  },
  {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: siteConfig.name,
    applicationCategory: "ProductivityApplication",
    operatingSystem: "Web",
    url: siteConfig.url,
    description: siteConfig.fullDescription,
    image: absoluteUrl(siteConfig.defaultOgImagePath),
    browserRequirements: "Requires JavaScript and a modern web browser.",
    keywords: [...siteConfig.defaultKeywords, ...homepageKeywords].join(", "),
    featureList: [
      "Intelligent query routing",
      "RAG-powered document analysis",
      "Deep research with sub-agents",
      "Web search and scraping",
      "Cross-conversation memory",
      "Multi-model support with vision",
      "Native integrations (Gmail, Drive, Slack, Notion, GitHub, Linear)",
      "Human-in-the-loop workflows",
      "Privacy-first architecture",
    ],
  },
];

async function SessionGate({ currentYear }: { currentYear: number }) {
  let session = null;

  try {
    session = await auth.api.getSession({ headers: await headers() });
  } catch {
    session = null;
  }

  return session?.user ? (
    <HomeContent currentYear={currentYear} />
  ) : (
    <LandingEntry currentYear={currentYear} />
  );
}

export default function Home() {
  const currentYear = new Date().getFullYear();

  return (
    <>
      <JsonLd data={homeStructuredData} />
      <Suspense
        fallback={
          <div className="flex h-screen items-center justify-center">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader className="size-5 animate-spin" />
              <span>Loading…</span>
            </div>
          </div>
        }
      >
        <SessionGate currentYear={currentYear} />
      </Suspense>
    </>
  );
}
