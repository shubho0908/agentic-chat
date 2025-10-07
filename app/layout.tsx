import type { Metadata } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/themeProvider";
import { Toaster } from "@/components/ui/sonner";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/appSidebar";
import { AuthSidebarTrigger } from "@/components/authSidebarTrigger";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Agentic Chat - Intelligent Conversations",
  description: "Chat with AI assistant powered by OpenAI with semantic caching and memory enhancement. Experience intelligent conversations with advanced AI capabilities.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL as string),
  openGraph: {
    title: "Agentic Chat - Intelligent Conversations",
    description: "Chat with AI assistant powered by OpenAI with semantic caching and memory enhancement. Experience intelligent conversations with advanced AI capabilities.",
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <QueryProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="light"
            enableSystem={false}
            disableTransitionOnChange
          >
            <SidebarProvider>
              <Suspense fallback={null}>
                <AppSidebar />
                <AuthSidebarTrigger />
              </Suspense>
              <main className="w-full">
                {children}
              </main>
            </SidebarProvider>
            <Toaster position="bottom-right" richColors />
          </ThemeProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
