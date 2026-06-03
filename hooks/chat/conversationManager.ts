import {
  type Attachment,
  type MessageContentPart,
  type Message,
  type MessageMetadata,
  MessageRole,
} from "@/lib/schemas/chat";
import { QueryClient } from "@tanstack/react-query";
import {
  extractTextFromContent,
  buildModelContentWithImageAttachments,
  generateTitle as generateTitleUtil,
} from "@/lib/contentUtils";
import { DOCUMENT_FOCUSED_ASSISTANT_PROMPT } from "@/lib/prompts";
import { orderConversationMessagesDesc } from "@/lib/conversationMessageOrder";
import { saveUserMessage, saveAssistantMessage } from "./messageApi";
import type { ConversationResult } from "@/types/chat";
import { OPENAI_MODELS } from "@/constants/openai-models";
import {
  extractTextQuery,
  isReferentialQuery as isReferentialTextQuery,
} from "@/lib/chat/referentialQuery";
import { queryKeys } from "@/lib/queryKeys";
import { apiRoutes } from "@/lib/routes";
import type { ArtifactMetadata } from "@/types/artifact";
import { estimateImageTokensForModel } from "@/lib/utils/imageTokenCost";

import { logger } from "@/lib/logger";
function generateTitle(content: string | MessageContentPart[]): string {
  return generateTitleUtil(content);
}

function isReferentialQuery(content: string | MessageContentPart[]): boolean {
  return isReferentialTextQuery(extractTextQuery(content));
}

function hasRecentAttachments(
  messages: Message[],
  lookbackCount: number = 3,
): boolean {
  const recentMessages = messages.slice(-lookbackCount);
  return recentMessages.some((msg) => {
    if (msg.attachments && msg.attachments.length > 0) return true;

    if (Array.isArray(msg.content)) {
      return msg.content.some(
        (part) =>
          typeof part === "object" && part !== null && "image_url" in part,
      );
    }
    return false;
  });
}

const MAX_CONTEXT_MESSAGES = 20;
const DOCUMENT_CONTEXT_MESSAGES = 12;

export const HUMAN_IN_THE_LOOP_PENDING_ASSISTANT_CONTENT =
  "Awaiting your response.";
export const ARTIFACT_ONLY_ASSISTANT_CONTENT =
  "[[__artifact_only_assistant_content_v1__]]";
export const STREAM_STOPPED_BY_USER_MARKER =
  "[[__stream_stopped_by_user_v1__]]";

export function getPersistableAssistantContent(
  assistantContent: string,
  metadata?: MessageMetadata,
): string | null {
  if (assistantContent.trim()) {
    return assistantContent;
  }

  if (metadata?.artifacts && metadata.artifacts.length > 0) {
    return ARTIFACT_ONLY_ASSISTANT_CONTENT;
  }

  if (
    metadata?.humanInTheLoopStatus === "pending" &&
    metadata.humanInTheLoopRequest
  ) {
    return HUMAN_IN_THE_LOOP_PENDING_ASSISTANT_CONTENT;
  }

  return null;
}

function formatArtifactForModelContext(artifact: ArtifactMetadata): string {
  const attrs = [
    `type="${artifact.type}"`,
    `title="${escapeArtifactAttribute(artifact.title)}"`,
    artifact.language
      ? `language="${escapeArtifactAttribute(artifact.language)}"`
      : null,
  ]
    .filter(Boolean)
    .join(" ");

  return `<artifact ${attrs}>\n${escapeArtifactBody(artifact.content)}\n</artifact>`;
}

function escapeArtifactAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeArtifactBody(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildAssistantContentForAPI(message: Message): string {
  const text = extractTextFromContent(message.content);
  const visibleText =
    text === ARTIFACT_ONLY_ASSISTANT_CONTENT ||
    text === STREAM_STOPPED_BY_USER_MARKER
      ? ""
      : text;
  const artifacts = message.metadata?.artifacts ?? [];

  if (artifacts.length === 0) {
    return visibleText;
  }

  const artifactContext = artifacts
    .map(formatArtifactForModelContext)
    .join("\n\n");
  return [visibleText, artifactContext]
    .filter((part) => part.trim())
    .join("\n\n");
}

function getMessageContentForAPI(
  message: Message,
): string | MessageContentPart[] {
  if (message.role === MessageRole.ASSISTANT) {
    return buildAssistantContentForAPI(message);
  }

  if (message.role === MessageRole.USER) {
    return buildModelContentWithImageAttachments(
      message.content,
      message.attachments,
    );
  }

  return message.content;
}

function estimateMessageTokens(
  content: string | MessageContentPart[],
  model: string,
): number {
  if (typeof content === "string") {
    return Math.ceil(content.length / 4) + 4;
  }

  return content.reduce((total, part) => {
    if (part.type === "text") {
      return total + Math.ceil(part.text.length / 4);
    }
    if (part.type === "image_url") {
      return total + estimateImageTokensForModel(model);
    }
    return total;
  }, 4);
}

function trimMessagesByApproximateTokenBudget(
  messages: Array<{
    role: MessageRole;
    content: string | MessageContentPart[];
  }>,
  model: string,
): Array<{ role: MessageRole; content: string | MessageContentPart[] }> {
  const contextWindow =
    OPENAI_MODELS.find((candidate) => candidate.id === model)?.contextWindow ??
    128000;
  const inputBudget = Math.max(4000, Math.floor(contextWindow * 0.8));
  const systemMessages = messages.filter(
    (message) => message.role === MessageRole.SYSTEM,
  );
  const nonSystemMessages = messages.filter(
    (message) => message.role !== MessageRole.SYSTEM,
  );

  const workingMessages = [...nonSystemMessages];
  let estimatedTokens =
    systemMessages.reduce(
      (total, message) => total + estimateMessageTokens(message.content, model),
      0,
    ) +
    workingMessages.reduce(
      (total, message) => total + estimateMessageTokens(message.content, model),
      0,
    );

  while (workingMessages.length > 2 && estimatedTokens > inputBudget) {
    const removed = workingMessages.shift();
    if (!removed) {
      break;
    }
    estimatedTokens -= estimateMessageTokens(removed.content, model);
  }

  return [...systemMessages, ...workingMessages];
}

export function buildMessagesForAPI(
  messages: Message[],
  newContent: string | MessageContentPart[],
  systemPrompt: string,
  model: string,
  currentAttachments?: Attachment[],
): Array<{ role: MessageRole; content: string | MessageContentPart[] }> {
  const isReferential = isReferentialQuery(newContent);
  const hasAttachmentsInContext = hasRecentAttachments(messages, 3);
  const hasCurrentDocumentAttachment =
    currentAttachments?.some((att) => !att.fileType.startsWith("image/")) ??
    false;

  if (
    (isReferential && hasAttachmentsInContext) ||
    hasCurrentDocumentAttachment
  ) {
    const recentMessages = messages.slice(-DOCUMENT_CONTEXT_MESSAGES);

    return trimMessagesByApproximateTokenBudget(
      [
        {
          role: MessageRole.SYSTEM,
          content: `${systemPrompt}\n\n${DOCUMENT_FOCUSED_ASSISTANT_PROMPT}`,
        },
        ...recentMessages.flatMap((message) => {
          const content = getMessageContentForAPI(message);
          if (
            content === "" ||
            (Array.isArray(content) && content.length === 0)
          )
            return [];
          return [{ role: message.role as MessageRole, content }];
        }),
        {
          role: MessageRole.USER,
          content: buildModelContentWithImageAttachments(
            newContent,
            currentAttachments,
          ),
        },
      ],
      model,
    );
  }

  const contextMessages =
    messages.length > MAX_CONTEXT_MESSAGES
      ? messages.slice(-MAX_CONTEXT_MESSAGES)
      : messages;

  return trimMessagesByApproximateTokenBudget(
    [
      {
        role: MessageRole.SYSTEM,
        content: systemPrompt,
      },
      ...contextMessages.flatMap((message) => {
        const content = getMessageContentForAPI(message);
        if (content === "" || (Array.isArray(content) && content.length === 0))
          return [];
        return [{ role: message.role as MessageRole, content }];
      }),
      {
        role: MessageRole.USER,
        content: buildModelContentWithImageAttachments(
          newContent,
          currentAttachments,
        ),
      },
    ],
    model,
  );
}

async function createNewConversation(
  userContent: string | MessageContentPart[],
  assistantContent: string,
  attachments?: Attachment[],
  earlyCreate: boolean = false,
  signal?: AbortSignal,
  metadata?: MessageMetadata,
  onConversationIdReady?: (conversationId: string) => void,
): Promise<ConversationResult | null> {
  try {
    const title = generateTitle(userContent);
    const createResponse = await fetch(apiRoutes.conversations, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
      signal,
    });

    if (!createResponse.ok) return null;

    const newConversation = await createResponse.json();
    const conversationId = newConversation.id;

    onConversationIdReady?.(conversationId);

    const userMessageId = await saveUserMessage(
      conversationId,
      userContent,
      attachments,
      signal,
    );

    if (!userMessageId) {
      return null;
    }

    if (earlyCreate) {
      return { conversationId, userMessageId, assistantMessageId: "" };
    }
    const persistableAssistantContent = getPersistableAssistantContent(
      assistantContent,
      metadata,
    );

    if (!persistableAssistantContent) {
      return { conversationId, userMessageId, assistantMessageId: "" };
    }

    const assistantMessageId = await saveAssistantMessage(
      conversationId,
      persistableAssistantContent,
      metadata,
    );

    if (!assistantMessageId) {
      return null;
    }

    return { conversationId, userMessageId, assistantMessageId };
  } catch (err) {
    if ((err as Error).name === "AbortError") {
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
  attachments?: Attachment[],
): void {
  const title = generateTitle(userContent);
  const textContent = extractTextFromContent(userContent);
  const placeholderAssistantId = `assistant-pending-${conversationId}`;
  const messages = orderConversationMessagesDesc([
    {
      id: userMessageId,
      role: MessageRole.USER,
      content: textContent,
      createdAt: new Date(userTimestamp).toISOString(),
      attachments: attachments || [],
    },
    {
      id: placeholderAssistantId,
      role: MessageRole.ASSISTANT,
      content: "",
      createdAt: new Date().toISOString(),
      attachments: [],
    },
  ]);

  queryClient.setQueryData(queryKeys.conversation(conversationId), {
    pages: [
      {
        conversation: {
          id: conversationId,
          title,
          isPublic: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        messages: {
          items: messages,
          nextCursor: undefined,
        },
        tokenUsage: undefined,
      },
    ],
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
  metadata?: MessageMetadata,
): void {
  const title = generateTitle(userContent);
  const textContent = extractTextFromContent(userContent);
  const messages = orderConversationMessagesDesc([
    {
      id: userMessageId,
      role: MessageRole.USER,
      content: textContent,
      createdAt: new Date(userTimestamp).toISOString(),
      attachments: attachments || [],
    },
    {
      id: assistantMessageId,
      role: MessageRole.ASSISTANT,
      content: assistantContent,
      createdAt: new Date().toISOString(),
      ...(metadata && { metadata }),
    },
  ]);

  queryClient.setQueryData(queryKeys.conversation(conversationId), {
    pages: [
      {
        conversation: {
          id: conversationId,
          title,
          isPublic: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        messages: {
          items: messages,
          nextCursor: undefined,
        },
        tokenUsage: undefined,
      },
    ],
    pageParams: [undefined],
  });
  queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
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
  metadata?: MessageMetadata,
  onConversationIdReady?: (conversationId: string) => void,
): Promise<void> {
  if (isNewConversation) {
    const result = await createNewConversation(
      userContent,
      assistantContent,
      attachments,
      earlyCreate,
      signal,
      metadata,
      onConversationIdReady,
    );

    if (result && onConversationCreated) {
      if (earlyCreate) {
        updateQueryCacheWithUserMessage(
          queryClient,
          result.conversationId,
          userContent,
          result.userMessageId,
          userTimestamp,
          attachments,
        );
      } else {
        const persistableAssistantContent = getPersistableAssistantContent(
          assistantContent,
          metadata,
        );
        if (!persistableAssistantContent) {
          onConversationCreated(result);
          return;
        }
        updateQueryCache(
          queryClient,
          result.conversationId,
          userContent,
          persistableAssistantContent,
          result.userMessageId,
          result.assistantMessageId,
          userTimestamp,
          attachments,
          metadata,
        );
      }
      onConversationCreated(result);
    }
  } else if (currentConversationId) {
    const persistableAssistantContent = getPersistableAssistantContent(
      assistantContent,
      metadata,
    );

    if (!persistableAssistantContent) {
      return;
    }

    const assistantMessageId = await saveAssistantMessage(
      currentConversationId,
      persistableAssistantContent,
      metadata,
    );
    if (assistantMessageId) {
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
      queryClient.invalidateQueries({
        queryKey: queryKeys.conversation(currentConversationId),
      });

      if (onConversationCreated) {
        onConversationCreated({
          conversationId: currentConversationId,
          userMessageId: "",
          assistantMessageId,
        });
      }
    }
  }
}
