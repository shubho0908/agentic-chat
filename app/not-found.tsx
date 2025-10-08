import { Metadata } from "next";
import { NotFoundClient } from "@/components/notFoundContent";

export const metadata: Metadata = {
  title: "404 - Page Not Found | Agentic Chat",
  description: "The page you're looking for doesn't exist or has been moved. Return to Agentic Chat to continue your intelligent conversations.",
  openGraph: {
    title: "404 - Page Not Found | Agentic Chat",
    description: "The page you're looking for doesn't exist or has been moved. Return to Agentic Chat to continue your intelligent conversations.",
    url: "/not-found",
    siteName: "Agentic Chat",
    images: [
      {
        url: "/api/og?title=404 - Page Not Found",
        width: 1200,
        height: 630,
        alt: "404 - Page Not Found",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "404 - Page Not Found | Agentic Chat",
    description: "The page you're looking for doesn't exist or has been moved.",
    images: ["/api/og?title=404 - Page Not Found"],
  },
};

export default function NotFound() {
  return <NotFoundClient />;
}
