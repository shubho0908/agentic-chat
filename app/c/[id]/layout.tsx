import { Metadata } from "next";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic';

async function getConversation(id: string) {
  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        isPublic: true,
        createdAt: true,
        updatedAt: true,
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

    if (!conversation) {
      return null;
    }

    return {
      conversation: {
        id: conversation.id,
        title: conversation.title,
        isPublic: conversation.isPublic,
        createdAt: conversation.createdAt.toISOString(),
        updatedAt: conversation.updatedAt.toISOString(),
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
    console.error('Error fetching conversation for metadata:', error);
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const conversation = await getConversation(id);

  if (!conversation) {
    return {
      title: "Chat Not Found - Agentic Chat",
      description: "The requested conversation could not be found.",
    };
  }

  const title = conversation.conversation.title || "New Conversation";
  const firstUserMessage = conversation.messages.items.find(m => m.role === 'user');
  const description = firstUserMessage 
    ? firstUserMessage.content.substring(0, 155) + (firstUserMessage.content.length > 155 ? '...' : '')
    : "Chat with AI assistant powered by OpenAI with semantic caching";

  const headersList = await headers();
  const protocol = headersList.get('x-forwarded-proto') || 'https';
  const host = headersList.get('host') || process.env.NEXT_PUBLIC_APP_URL?.replace(/^https?:\/\//, '');
  const baseUrl = host ? `${protocol}://${host}` : process.env.NEXT_PUBLIC_APP_URL || 'https://localhost:3000';
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
