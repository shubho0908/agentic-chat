import SharedConversationClient from "./sharedConversationClient";

export default function SharedConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <SharedConversationClient params={params} />;
}
