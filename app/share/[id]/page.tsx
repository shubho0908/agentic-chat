import type { ResolvingMetadata } from "next";
import SharedConversationClient from "./sharedConversationClient";

export async function generateMetadata(
  _props: { params: Promise<{ id: string }> },
  parent: ResolvingMetadata
) {
  return await parent;
}

export default function SharedConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <SharedConversationClient params={params} />;
}
