import { ChatPageClient } from "@/components/chat/chatPageClient";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Chat",
  description: "AI chat conversation",
};

export default async function ChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: conversationId } = await params;

  return <ChatPageClient conversationId={conversationId} />;
}
