import { type Attachment, type MessageContentPart, type Message } from "@/lib/schemas/chat";
import { QueryClient } from "@tanstack/react-query";
import { extractTextFromContent, generateTitle as generateTitleUtil } from "@/lib/content-utils";
import { saveUserMessage, saveAssistantMessage } from "./message-api";
import { type ConversationResult } from "./types";

export function generateTitle(content: string | MessageContentPart[]): string {
  return generateTitleUtil(content);
}

export function buildMessagesForAPI(
  messages: Message[],
  newContent: string | MessageContentPart[],
  systemPrompt: string
): Array<{ role: "user" | "assistant" | "system"; content: string | MessageContentPart[] }> {
  return [
    {
      role: "system" as const,
      content: systemPrompt,
    },
    ...messages.map(({ role, content }) => ({
      role: role as "user" | "assistant" | "system",
      content,
    })),
    {
      role: "user" as const,
      content: newContent,
    },
  ];
}

async function createNewConversation(
  userContent: string | MessageContentPart[],
  assistantContent: string,
  attachments?: Attachment[]
): Promise<ConversationResult | null> {
  try {
    const title = generateTitle(userContent);
    const createResponse = await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });

    if (!createResponse.ok) return null;

    const newConversation = await createResponse.json();
    const conversationId = newConversation.id;

    const userMessageId = await saveUserMessage(conversationId, userContent, attachments);
    const assistantMessageId = await saveAssistantMessage(conversationId, assistantContent);

    if (!userMessageId || !assistantMessageId) {
      return null;
    }

    return { conversationId, userMessageId, assistantMessageId };
  } catch (err) {
    console.error("Failed to create conversation:", err);
    return null;
  }
}

function updateQueryCache(
  queryClient: QueryClient,
  conversationId: string,
  userContent: string | MessageContentPart[],
  assistantContent: string,
  userMessageId: string,
  assistantMessageId: string,
  userTimestamp: number,
  attachments?: Attachment[]
): void {
  const title = generateTitle(userContent);
  const textContent = extractTextFromContent(userContent);

  queryClient.setQueryData(["conversation", conversationId], {
    conversation: {
      id: conversationId,
      title,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    messages: {
      items: [
        {
          id: userMessageId,
          role: "user" as const,
          content: textContent,
          createdAt: new Date(userTimestamp).toISOString(),
          attachments: attachments || [],
        },
        {
          id: assistantMessageId,
          role: "assistant" as const,
          content: assistantContent,
          createdAt: new Date().toISOString(),
        },
      ],
    },
  });
  queryClient.invalidateQueries({ queryKey: ["conversations"] });
}

export async function handleConversationSaving(
  isNewConversation: boolean,
  currentConversationId: string | null,
  userContent: string | MessageContentPart[],
  assistantContent: string,
  userTimestamp: number,
  queryClient: QueryClient,
  onConversationCreated?: (data: ConversationResult) => void,
  attachments?: Attachment[]
): Promise<void> {
  if (isNewConversation) {
    const result = await createNewConversation(userContent, assistantContent, attachments);

    if (result && onConversationCreated) {
      updateQueryCache(
        queryClient,
        result.conversationId,
        userContent,
        assistantContent,
        result.userMessageId,
        result.assistantMessageId,
        userTimestamp,
        attachments
      );
      onConversationCreated(result);
    }
  } else if (currentConversationId) {
    await saveAssistantMessage(currentConversationId, assistantContent);
  }
}
