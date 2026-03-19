import type { ResolvingMetadata } from "next";
import { ChatPageClient } from "@/components/chat/chatPageClient";

export async function generateMetadata(
  _props: { params: Promise<{ id: string }> },
  parent: ResolvingMetadata
) {
  return await parent;
}

export default async function ChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: conversationId } = await params;

  return <ChatPageClient conversationId={conversationId} />;
}
