import { type Attachment, type MessageContentPart, type Message, type MessageMetadata } from "@/lib/schemas/chat";
import { QueryClient } from "@tanstack/react-query";
import { extractTextFromContent, generateTitle as generateTitleUtil } from "@/lib/contentUtils";
import { DOCUMENT_FOCUSED_ASSISTANT_PROMPT } from "@/lib/prompts";
import { saveUserMessage, saveAssistantMessage } from "./messageApi";
import type { ConversationResult } from "@/types/chat";
import { OPENAI_MODELS } from "@/constants/openai-models";
import { extractTextQuery, isReferentialQuery as isReferentialTextQuery } from "@/lib/chat/referentialQuery";


import { logger } from "@/lib/logger";
function generateTitle(content: string | MessageContentPart[]): string {
  return generateTitleUtil(content);
}

function isReferentialQuery(content: string | MessageContentPart[]): boolean {
  return isReferentialTextQuery(extractTextQuery(content));
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
const DOCUMENT_CONTEXT_MESSAGES = 12;
const APPROX_IMAGE_TOKENS = 850;

function estimateMessageTokens(content: string | MessageContentPart[]): number {
  if (typeof content === 'string') {
    return Math.ceil(content.length / 4) + 4;
  }

  return content.reduce((total, part) => {
    if (part.type === 'text') {
      return total + Math.ceil(part.text.length / 4);
    }
    if (part.type === 'image_url') {
      return total + APPROX_IMAGE_TOKENS;
    }
    return total;
  }, 4);
}

function trimMessagesByApproximateTokenBudget(
  messages: Array<{ role: "user" | "assistant" | "system"; content: string | MessageContentPart[] }>,
  model: string
): Array<{ role: "user" | "assistant" | "system"; content: string | MessageContentPart[] }> {
  const contextWindow = OPENAI_MODELS.find((candidate) => candidate.id === model)?.contextWindow ?? 128000;
  const inputBudget = Math.max(4000, Math.floor(contextWindow * 0.8));
  const systemMessages = messages.filter((message) => message.role === 'system');
  const nonSystemMessages = messages.filter((message) => message.role !== 'system');

  const workingMessages = [...nonSystemMessages];
  let estimatedTokens =
    systemMessages.reduce((total, message) => total + estimateMessageTokens(message.content), 0) +
    workingMessages.reduce((total, message) => total + estimateMessageTokens(message.content), 0);

  while (workingMessages.length > 2 && estimatedTokens > inputBudget) {
    const removed = workingMessages.shift();
    if (!removed) {
      break;
    }
    estimatedTokens -= estimateMessageTokens(removed.content);
  }

  return [...systemMessages, ...workingMessages];
}

export function buildMessagesForAPI(
  messages: Message[],
  newContent: string | MessageContentPart[],
  systemPrompt: string,
  model: string
): Array<{ role: "user" | "assistant" | "system"; content: string | MessageContentPart[] }> {
  const isReferential = isReferentialQuery(newContent);
  const hasAttachmentsInContext = hasRecentAttachments(messages, 3);

  if (isReferential && hasAttachmentsInContext) {
    const recentMessages = messages.slice(-DOCUMENT_CONTEXT_MESSAGES);
    
    return trimMessagesByApproximateTokenBudget([
      {
        role: "system" as const,
        content: `${systemPrompt}\n\n${DOCUMENT_FOCUSED_ASSISTANT_PROMPT}`,
      },
      ...recentMessages.map(({ role, content }) => ({
        role: role as "user" | "assistant" | "system",
        content,
      })),
      {
        role: "user" as const,
        content: newContent,
      },
    ], model);
  }

  const contextMessages = messages.length > MAX_CONTEXT_MESSAGES 
    ? messages.slice(-MAX_CONTEXT_MESSAGES)
    : messages;

  return trimMessagesByApproximateTokenBudget([
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
  ], model);
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
    logger.error("Failed to create conversation:", err);
    return null;
  }
}

function updateQueryCacheWithUserMessage(
  queryClient: QueryClient,
  conversationId: string,
  userContent: string | MessageContentPart[],
  userMessageId: string,
  userTimestamp: number,
  attachments?: Attachment[]
): void {
  const title = generateTitle(userContent);
  const textContent = extractTextFromContent(userContent);
  const placeholderAssistantId = `assistant-pending-${conversationId}`;

  queryClient.setQueryData(["conversation", conversationId], {
    pages: [{
      conversation: {
        id: conversationId,
        title,
        isPublic: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      messages: {
        items: [
          {
            id: placeholderAssistantId,
            role: "assistant" as const,
            content: "",
            createdAt: new Date().toISOString(),
            attachments: [],
          },
          {
            id: userMessageId,
            role: "user" as const,
            content: textContent,
            createdAt: new Date(userTimestamp).toISOString(),
            attachments: attachments || [],
          },
        ],
        nextCursor: undefined,
      },
      tokenUsage: undefined,
    }],
    pageParams: [undefined],
  });
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
        isPublic: false,
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
        nextCursor: undefined,
      },
      tokenUsage: undefined,
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
      if (earlyCreate) {
        updateQueryCacheWithUserMessage(
          queryClient,
          result.conversationId,
          userContent,
          result.userMessageId,
          userTimestamp,
          attachments
        );
      } else if (assistantContent) {
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
