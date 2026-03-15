import { Metadata } from "next";
import { headers } from "next/headers";
import { appBaseUrl } from "@/lib/appUrl";

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const title = "Private Conversation";
  const description = "Sign in to view your conversation in Agentic Chat.";

  const headersList = await headers();
  const protocol = headersList.get('x-forwarded-proto') || 'https';
  const host = headersList.get('host') || appBaseUrl.replace(/^https?:\/\//, '');
  const baseUrl = host ? `${protocol}://${host}` : appBaseUrl;
  const ogImageUrl = `${baseUrl}/api/og?title=${encodeURIComponent(title)}`;

  return {
    title: `${title} - Agentic Chat`,
    description,
    openGraph: {
      title: `${title} - Agentic Chat`,
      description,
      url: `${baseUrl}/c/${id}`,
      siteName: "Agentic Chat",
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
      locale: "en_US",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} - Agentic Chat`,
      description,
      images: [ogImageUrl],
    },
  };
}

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
