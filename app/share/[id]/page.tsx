import type { Metadata } from "next";
import SharedConversationClient from "./shared-conversation-client";

export const metadata: Metadata = {
  title: "Shared Conversation",
  description: "View a shared conversation on Agentic Chat.",
};

export default function SharedConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <SharedConversationClient params={params} />;
}
