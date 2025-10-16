import { Metadata } from "next";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic';

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
    console.error('Error fetching shared conversation for metadata:', error);
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
      title: "Shared Conversation Not Found - Agentic Chat",
      description: "The requested shared conversation could not be found or is no longer public.",
    };
  }

  const title = conversation.conversation.title || "Shared Conversation";
  const userName = conversation.conversation.user.name || conversation.conversation.user.email.split('@')[0];
  const firstUserMessage = conversation.messages.items.find(m => m.role === 'user');
  const description = firstUserMessage 
    ? firstUserMessage.content.substring(0, 155) + (firstUserMessage.content.length > 155 ? '...' : '')
    : `A conversation shared by ${userName} on Agentic Chat`;

  const headersList = await headers();
  const protocol = headersList.get('x-forwarded-proto') || 'https';
  const host = headersList.get('host') || process.env.NEXT_PUBLIC_APP_URL?.replace(/^https?:\/\//, '');
  const baseUrl = host ? `${protocol}://${host}` : process.env.NEXT_PUBLIC_APP_URL || 'https://localhost:3000';
  const ogImageUrl = `${baseUrl}/api/og?title=${encodeURIComponent(title)}`;

  return {
    title: `${title} - Shared on Agentic Chat`,
    description,
    openGraph: {
      title: `${title} - Shared on Agentic Chat`,
      description,
      url: `${baseUrl}/share/${id}`,
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
      title: `${title} - Shared on Agentic Chat`,
      description,
      images: [ogImageUrl],
    },
  };
}

export default function SharedChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
