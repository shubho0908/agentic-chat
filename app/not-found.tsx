import { Metadata } from "next";
import { NotFoundClient } from "@/components/notFoundContent";
import { absoluteUrl, noIndexRobots, siteConfig } from "@/lib/seo";

export const metadata: Metadata = {
  title: "404 - Page Not Found",
  description: "The page you're looking for doesn't exist or has been moved. Return to Agentic Chat to continue your intelligent conversations.",
  robots: noIndexRobots,
  openGraph: {
    title: "404 - Page Not Found | Agentic Chat",
    description: "The page you're looking for doesn't exist or has been moved. Return to Agentic Chat to continue your intelligent conversations.",
    url: "/not-found",
    siteName: "Agentic Chat",
    images: [
      {
        url: absoluteUrl("/api/og?title=404%20-%20Page%20Not%20Found"),
        width: 1200,
        height: 630,
        alt: "404 - Page Not Found",
      },
    ],
    locale: siteConfig.locale,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "404 - Page Not Found | Agentic Chat",
    description: "The page you're looking for doesn't exist or has been moved.",
    images: [absoluteUrl("/api/og?title=404%20-%20Page%20Not%20Found")],
  },
};

export default function NotFound() {
  return <NotFoundClient />;
}
