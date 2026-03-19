import type { Metadata } from "next";
import { Suspense } from "react";
import { Loader } from "lucide-react";
import { HomeContent } from "@/components/homeContent";
import { appBaseUrl } from "@/lib/appUrl";

export const metadata: Metadata = {
  title: "Agentic Chat - Search, memory, and tools",
  description: "A chat surface that keeps context, searches the web, works with documents, and connects to Google Workspace with your own key if you want it.",
  metadataBase: new URL(appBaseUrl),
  openGraph: {
    title: "Agentic Chat - Search, memory, and tools",
    description: "A chat surface that keeps context, searches the web, works with documents, and connects to Google Workspace.",
    url: '/',
    siteName: "Agentic Chat",
    images: [
      {
        url: '/api/og/home',
        width: 1200,
        height: 630,
        alt: "Agentic Chat - Search, memory, and tools",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Agentic Chat - Search, memory, and tools",
    description: "A chat surface that keeps context, searches the web, works with documents, and connects to Google Workspace.",
    images: ['/api/og/home'],
  },
};

export default function Home() {
  return (
    <Suspense fallback={
      <div className="flex h-screen items-center justify-center">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader className="size-5 animate-spin" />
          <span>Loading...</span>
        </div>
      </div>
    }>
      <HomeContent />
    </Suspense>
  );
}
