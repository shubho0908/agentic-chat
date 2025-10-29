import { type Attachment, type MessageContentPart, type Message, type MessageMetadata } from "@/lib/schemas/chat";
import { QueryClient } from "@tanstack/react-query";
import { extractTextFromContent, generateTitle as generateTitleUtil } from "@/lib/content-utils";
import { DOCUMENT_FOCUSED_ASSISTANT_PROMPT } from "@/lib/prompts";
import { saveUserMessage, saveAssistantMessage } from "./message-api";
import type { ConversationResult } from "@/types/chat";

export function generateTitle(content: string | MessageContentPart[]): string {
  return generateTitleUtil(content);
}

function isReferentialQuery(content: string | MessageContentPart[]): boolean {
  const textQuery = typeof content === 'string' 
    ? content 
    : content.filter(p => typeof p === 'object' && 'type' in p && p.type === 'text' && 'text' in p && p.text).map(p => 'text' in p ? p.text : '').join(' ');

  const normalized = textQuery.toLowerCase().trim();

  const patterns = [
    /\b(this|that|the|attached)\s+(doc|document|file|pdf|attachment|image|picture)/i,
    /\bwhat('s|\s+is)?\s+(in|about)\s+(this|that|the|it)/i,
    /\b(summarize|explain|analyze|describe)\s+(this|that|the|it)/i,
    /^(summarize|summary|explain|analyze|describe)$/i,
  ];

  return patterns.some(p => p.test(normalized));
}

function hasRecentAttachments(messages: Message[], lookbackCount: number = 3): boolean {
  const recentMessages = messages.slice(-lookbackCount);
  return recentMessages.some(msg => {
    if (msg.attachments && msg.attachments.length > 0) return true;
    
    if (Array.isArray(msg.content)) {
      return msg.content.some(part => 
        typeof part === 'object' && part !== null && 'image_url' in part
      );
    }
    return false;
  });
}

const MAX_CONTEXT_MESSAGES = 20;

export function buildMessagesForAPI(
  messages: Message[],
  newContent: string | MessageContentPart[],
  systemPrompt: string
): Array<{ role: "user" | "assistant" | "system"; content: string | MessageContentPart[] }> {
  const isReferential = isReferentialQuery(newContent);
  const hasAttachmentsInContext = hasRecentAttachments(messages, 3);

  if (isReferential && hasAttachmentsInContext) {
    const recentMessages = messages.slice(-4);
    
    return [
      {
        role: "system" as const,
        content: DOCUMENT_FOCUSED_ASSISTANT_PROMPT,
      },
      ...recentMessages.map(({ role, content }) => ({
        role: role as "user" | "assistant" | "system",
        content,
      })),
      {
        role: "user" as const,
        content: newContent,
      },
    ];
  }

  const contextMessages = messages.length > MAX_CONTEXT_MESSAGES 
    ? messages.slice(-MAX_CONTEXT_MESSAGES)
    : messages;

  return [
    {
      role: "system" as const,
      content: systemPrompt,
    },
    ...contextMessages.map(({ role, content }) => ({
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
  attachments?: Attachment[],
  earlyCreate: boolean = false,
  signal?: AbortSignal,
  metadata?: MessageMetadata
): Promise<ConversationResult | null> {
  try {
    const title = generateTitle(userContent);
    const createResponse = await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
      signal,
    });

    if (!createResponse.ok) return null;

    const newConversation = await createResponse.json();
    const conversationId = newConversation.id;

    const userMessageId = await saveUserMessage(conversationId, userContent, attachments, signal);
    
    if (!userMessageId) {
      return null;
    }

    if (earlyCreate) {
      return { conversationId, userMessageId, assistantMessageId: '' };
    }
    const assistantMessageId = await saveAssistantMessage(conversationId, assistantContent, metadata);

    if (!assistantMessageId) {
      return null;
    }

    return { conversationId, userMessageId, assistantMessageId };
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw err;
    }
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
  attachments?: Attachment[],
  metadata?: MessageMetadata
): void {
  const title = generateTitle(userContent);
  const textContent = extractTextFromContent(userContent);

  queryClient.setQueryData(["conversation", conversationId], {
    pages: [{
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
            ...(metadata && { metadata }),
          },
        ],
      },
    }],
    pageParams: [undefined],
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
  attachments?: Attachment[],
  earlyCreate: boolean = false,
  signal?: AbortSignal,
  metadata?: MessageMetadata
): Promise<void> {
  if (isNewConversation) {
    const result = await createNewConversation(userContent, assistantContent, attachments, earlyCreate, signal, metadata);

    if (result && onConversationCreated) {
      if (!earlyCreate && assistantContent) {
        updateQueryCache(
          queryClient,
          result.conversationId,
          userContent,
          assistantContent,
          result.userMessageId,
          result.assistantMessageId,
          userTimestamp,
          attachments,
          metadata
        );
      }
      onConversationCreated(result);
    }
  } else if (currentConversationId && assistantContent) {
    const assistantMessageId = await saveAssistantMessage(currentConversationId, assistantContent, metadata);
    if (assistantMessageId) {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.invalidateQueries({ queryKey: ["conversation", currentConversationId] });
      
      if (onConversationCreated) {
        onConversationCreated({
          conversationId: currentConversationId,
          userMessageId: '',
          assistantMessageId
        });
      }
    }
  }
}
