import { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { absoluteUrl, noIndexRobots, siteConfig } from "@/lib/seo";


export const dynamic = "force-dynamic";

import { logger } from "@/lib/logger";
async function getSharedConversation(id: string) {
  try {
    const conversation = await prisma.conversation.findUnique({
      where: { 
        id,
        isPublic: true,
      },
      select: {
        id: true,
        title: true,
        isPublic: true,
        createdAt: true,
        updatedAt: true,
        user: {
          select: {
            name: true,
            email: true,
          },
        },
        messages: {
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          take: 10,
          select: {
            id: true,
            role: true,
            content: true,
            createdAt: true,
          },
        },
      },
    });

    if (!conversation || !conversation.isPublic) {
      return null;
    }

    return {
      conversation: {
        id: conversation.id,
        title: conversation.title,
        isPublic: conversation.isPublic,
        createdAt: conversation.createdAt.toISOString(),
        updatedAt: conversation.updatedAt.toISOString(),
        user: conversation.user,
      },
      messages: {
        items: conversation.messages.map(msg => ({
          id: msg.id,
          role: msg.role.toLowerCase() as "user" | "assistant",
          content: msg.content,
          createdAt: msg.createdAt.toISOString(),
        })),
      },
    };
  } catch (error) {
    logger.error('Error fetching shared conversation for metadata:', error);
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const conversation = await getSharedConversation(id);

  if (!conversation) {
    return {
      title: "Shared Conversation Not Found",
      description: "The requested shared conversation could not be found or is no longer public.",
      robots: noIndexRobots,
    };
  }

  const title = conversation.conversation.title || "Shared Conversation";
  const userName = conversation.conversation.user.name || conversation.conversation.user.email.split('@')[0];
  const firstUserMessage = conversation.messages.items.find(m => m.role === 'user');
  const normalizedSnippet = firstUserMessage?.content.replace(/\s+/g, " ").trim();
  const description = normalizedSnippet
    ? normalizedSnippet.slice(0, 155) + (normalizedSnippet.length > 155 ? "..." : "")
    : `A conversation shared by ${userName} on ${siteConfig.name}`;
  const fullTitle = `${title} | Shared on ${siteConfig.name}`;
  const ogImageUrl = absoluteUrl(`/api/og?title=${encodeURIComponent(title)}`);

  return {
    title: `${title} | Shared Conversation`,
    description,
    alternates: {
      canonical: `/share/${id}`,
    },
    openGraph: {
      title: fullTitle,
      description,
      url: `/share/${id}`,
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

export default function SharedChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
