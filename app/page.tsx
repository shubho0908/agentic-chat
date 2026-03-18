import type { Metadata } from "next";
import { Suspense } from "react";
import { Loader } from "lucide-react";
import { HomeContent } from "@/components/homeContent";
import { appBaseUrl } from "@/lib/appUrl";

export const metadata: Metadata = {
  title: "Agentic Chat - Intelligent Conversations",
  description: "Chat with AI assistant powered by OpenAI with semantic caching and memory enhancement. Experience intelligent conversations with advanced AI capabilities.",
  metadataBase: new URL(appBaseUrl),
  openGraph: {
    title: "Agentic Chat - Intelligent Conversations",
    description: "Chat with AI assistant powered by OpenAI with semantic caching and memory enhancement.",
    url: '/',
    siteName: "Agentic Chat",
    images: [
      {
        url: '/api/og/home',
        width: 1200,
        height: 630,
        alt: "Agentic Chat - Intelligent Conversations",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Agentic Chat - Intelligent Conversations",
    description: "Chat with AI assistant powered by OpenAI with semantic caching and memory enhancement.",
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
