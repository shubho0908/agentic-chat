import { ChatPageClient } from "@/components/chat/chatPageClient";

export default async function ChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: conversationId } = await params;

  return <ChatPageClient conversationId={conversationId} />;
}
