import { Metadata } from "next";
import { absoluteUrl, noIndexRobots, siteConfig } from "@/lib/seo";
import { apiRoutes, appRoutes } from "@/lib/routes";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const title = "Private Conversation";
  const description = "Sign in to view your conversation in Agentic Chat.";
  const fullTitle = `${title} | ${siteConfig.name}`;
  const route = appRoutes.conversation(id);
  const ogImageUrl = absoluteUrl(`${apiRoutes.og}?title=${encodeURIComponent(title)}`);

  return {
    title,
    description,
    alternates: {
      canonical: route,
    },
    openGraph: {
      title: fullTitle,
      description,
      url: route,
      siteName: siteConfig.name,
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
      locale: siteConfig.locale,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description,
      images: [ogImageUrl],
    },
    robots: noIndexRobots,
  };
}

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
