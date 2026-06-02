import SharedConversationClient from "./sharedConversationClient";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Shared Conversation",
  description: "View a shared conversation",
};

export default function SharedConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <SharedConversationClient params={params} />;
}
