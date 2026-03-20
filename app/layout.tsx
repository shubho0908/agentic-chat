import type { Metadata, Viewport } from "next";
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
import { absoluteUrl, indexRobots, siteConfig } from "@/lib/seo";

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

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "dark light",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafaf9" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
};

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  applicationName: siteConfig.name,
  title: {
    default: siteConfig.defaultTitle,
    template: `%s | ${siteConfig.name}`,
  },
  description: siteConfig.fullDescription,
  keywords: Array.from(siteConfig.defaultKeywords),
  authors: [
    {
      name: siteConfig.name,
      url: siteConfig.githubUrl,
    },
  ],
  category: siteConfig.category,
  classification: siteConfig.classification,
  creator: siteConfig.name,
  publisher: siteConfig.name,
  referrer: "origin-when-cross-origin",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  alternates: {
    canonical: "/",
  },
  icons: {
    icon: [{ url: "/favicon.ico", rel: "icon" }],
    shortcut: [{ url: "/favicon.ico", rel: "shortcut icon" }],
    apple: [{ url: "/favicon.ico", rel: "apple-touch-icon" }],
  },
  openGraph: {
    title: siteConfig.defaultTitle,
    description: siteConfig.description,
    url: "/",
    siteName: siteConfig.name,
    images: [
      {
        url: absoluteUrl(siteConfig.defaultOgImagePath),
        width: 1200,
        height: 630,
        alt: siteConfig.defaultTitle,
      },
    ],
    locale: siteConfig.locale,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: siteConfig.defaultTitle,
    description: siteConfig.description,
    images: [absoluteUrl(siteConfig.defaultOgImagePath)],
  },
  robots: indexRobots,
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
                  <div className="w-full">
                    {children}
                  </div>
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
