import type { Metadata } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono, Newsreader } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/themeProvider";
import { Toaster } from "@/components/ui/sonner";
import { QueryProvider } from "@/components/providers/queryProvider";
import { LayoutProvider } from "@/components/providers/layoutProvider";
import { StreamingProvider } from "@/contexts/streaming-context";
import { SidebarProvider } from "@/components/ui/sidebar";
import { ConditionalSidebar } from "@/components/conditionalSidebar";
import { appBaseUrl } from "@/lib/appUrl";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

const SITE_TITLE = "Agentic Chat - Search, memory, and tools";
const SITE_DESCRIPTION =
  "A chat surface that keeps context, searches the web, works with documents, and connects to Google Workspace.";
const SITE_FULL_DESCRIPTION =
  "A chat surface that keeps context, searches the web, works with documents, and connects to Google Workspace with your own key if you want it.";
const SITE_NAME = "Agentic Chat";
const SITE_OG_IMAGE_URL = "/api/og/home";

export const metadata: Metadata = {
  title: SITE_TITLE,
  description: SITE_FULL_DESCRIPTION,
  metadataBase: new URL(appBaseUrl),
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: '/',
    siteName: SITE_NAME,
    images: [
      {
        url: SITE_OG_IMAGE_URL,
        width: 1200,
        height: 630,
        alt: SITE_TITLE,
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [SITE_OG_IMAGE_URL],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${newsreader.variable} antialiased selection:bg-primary/20 bg-background`}
      >
        <div className="fixed inset-0 z-[-1] opacity-[0.03] dark:opacity-[0.03] pointer-events-none mix-blend-overlay bg-[url('/noise.svg')]" />
        <QueryProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="dark"
            enableSystem={false}
            disableTransitionOnChange
          >
            <StreamingProvider>
              <LayoutProvider>
                <SidebarProvider>
                  <Suspense fallback={null}>
                    <ConditionalSidebar />
                  </Suspense>
                  <main className="w-full">
                    {children}
                  </main>
                </SidebarProvider>
              </LayoutProvider>
            </StreamingProvider>
            <Toaster position="bottom-right" richColors />
          </ThemeProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
