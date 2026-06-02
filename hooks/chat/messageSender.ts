import type { Message, Attachment, MessageContentPart } from "@/lib/schemas/chat";
import { MessageRole } from "@/lib/schemas/chat";
import type { ConversationResult } from "@/types/chat";
import { toast } from "sonner";
import { buildMultimodalContent } from "@/lib/contentUtils";
import { getModel } from "@/lib/storage";
import { TOAST_ERROR_MESSAGES, HOOK_ERROR_MESSAGES } from "@/constants/errors";
import { saveUserMessage } from "./messageApi";
import { handleConversationSaving } from "./conversationManager";
import type { SendMessageContext, BaseChatContext } from "@/types/chatHooks";
import { handleStreamingResponse } from "./streamingHandler";
import { getResumeConversationState } from "./resumeState";
import { queryKeys } from "@/lib/queryKeys";
import { appRoutes } from "@/lib/routes";
import { toUserFriendlyError } from "@/lib/errorMessages";

export async function continueIncompleteConversation(
  userMessage: Message,
  context: BaseChatContext,
  session?: { user: { id: string } },
  activeTool?: string | null,
  memoryEnabled?: boolean,
  thinkingEnabled?: boolean
): Promise<{ success: boolean; error?: string }> {
  const {
    messages,
    conversationId,
    abortSignal,
    queryClient,
    onMessagesUpdate,
    saveToCacheMutate,
    onMemoryStatusUpdate,
  } = context;

  if (!conversationId) {
    return { success: false, error: "No conversation ID" };
  }

  const model = getModel();
  if (!model) {
    toast.error(TOAST_ERROR_MESSAGES.MODEL.NOT_SELECTED);
    return { success: false, error: "No model selected" };
  }

  const { contextMessages, existingAssistantMessageId } = getResumeConversationState(
    messages,
    userMessage.id
  );

  const userTextContent = typeof userMessage.content === 'string'
    ? userMessage.content
    : userMessage.content;
  const reconstructedContent = typeof userTextContent === 'string' && userMessage.attachments
    ? buildMultimodalContent(userTextContent, userMessage.attachments)
    : userMessage.content;

  const result = await handleStreamingResponse(
    {
      messages: contextMessages,
      conversationId,
      userMessageContent: reconstructedContent,
      userTimestamp: userMessage.timestamp ?? Date.now(),
      userAttachments: userMessage.attachments,
      model,
      abortSignal,
      queryClient,
      session,
      activeTool,
      memoryEnabled,
      thinkingEnabled,
      existingAssistantMessageId,
    },
    {
      onMessagesUpdate,
      saveToCacheMutate,
      onMemoryStatusUpdate,
      onArtifact: context.onArtifact,
    }
  );

  if (!result.success && result.error && result.error !== "aborted") {
    toast.error(TOAST_ERROR_MESSAGES.CHAT.FAILED_SEND, {
      description: toUserFriendlyError(result.error),
    });
  }

  return result;
}

async function createAndSaveConversation(
  messageContent: string | MessageContentPart[],
  userMessage: Message,
  queryClient: SendMessageContext['queryClient'],
  onMessagesUpdate: SendMessageContext['onMessagesUpdate'],
  onConversationIdUpdate: SendMessageContext['onConversationIdUpdate'],
  onNavigate: SendMessageContext['onNavigate'],
  attachments: Attachment[] | undefined,
  abortSignal: AbortSignal,
): Promise<string> {
  let conversationId: string | null = null;
  await handleConversationSaving(
    true,
    null,
    messageContent,
    "",
    userMessage.timestamp ?? Date.now(),
    queryClient,
    (data: ConversationResult) => {
      conversationId = data.conversationId;
      onMessagesUpdate((prev) =>
        prev.map((msg) =>
          msg.id === userMessage.id ? { ...msg, id: data.userMessageId } : msg
        )
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
      onNavigate(appRoutes.conversation(data.conversationId));
    },
    attachments,
    true,
    abortSignal,
    undefined,
    (id: string) => {
      conversationId = id;
      onConversationIdUpdate(id);
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
    }
  );
  if (!conversationId) throw new Error("Failed to create conversation");
  return conversationId;
}

export async function handleSendMessage(
  content: string,
  attachments: Attachment[] | undefined,
  context: SendMessageContext,
  session?: { user: { id: string } },
  activeTool?: string | null,
  memoryEnabled?: boolean,
  thinkingEnabled?: boolean
): Promise<{ success: boolean; error?: string }> {
  const {
    messages,
    conversationId,
    abortSignal,
    queryClient,
    onMessagesUpdate,
    onConversationIdUpdate,
    onNavigate,
    saveToCacheMutate,
    onMemoryStatusUpdate,
  } = context;

  const model = getModel();
  if (!model) {
    toast.error(TOAST_ERROR_MESSAGES.MODEL.NOT_SELECTED);
    return { success: false, error: "No model selected" };
  }

  const messageContent = buildMultimodalContent(content.trim(), attachments);

  const userMessage: Message = {
    role: MessageRole.USER,
    content: messageContent,
    id: `user-${Date.now()}`,
    timestamp: Date.now(),
    attachments,
  };

  const isNewConversation = !conversationId;
  const placeholderAssistantId = conversationId
    ? `assistant-pending-${conversationId}`
    : `assistant-pending-${userMessage.id}`;

  onMessagesUpdate((prev) => [
    ...prev,
    userMessage,
    {
      role: MessageRole.ASSISTANT,
      content: "",
      id: placeholderAssistantId,
      timestamp: Date.now(),
      model,
      toolActivities: [],
    },
  ]);

  let savedMsgId: string | null = null;
  let userMessageWasPersisted = false;

  try {
    let currentConversationId = conversationId;

    if (isNewConversation) {
      currentConversationId = await createAndSaveConversation(
        messageContent, userMessage, queryClient, onMessagesUpdate,
        onConversationIdUpdate, onNavigate, attachments, abortSignal
      );
      return { success: true };
    } else {
      if (!currentConversationId) {
        throw new Error("Conversation ID is required for existing conversations");
      }

      savedMsgId = await saveUserMessage(
        currentConversationId,
        messageContent,
        attachments,
        abortSignal
      );

      if (!savedMsgId) {
        throw new Error("Failed to save user message");
      }

      const persistedUserMessageId = savedMsgId;
      userMessageWasPersisted = true;

      onMessagesUpdate((prev) =>
        prev.map((msg) =>
          msg.id === userMessage.id ? { ...msg, id: persistedUserMessageId } : msg
        )
      );
    }

    if (!currentConversationId) {
      throw new Error("Conversation ID is required before streaming the response");
    }

    const result = await handleStreamingResponse(
      {
        messages,
        conversationId: currentConversationId,
        userMessageContent: messageContent,
        userTimestamp: userMessage.timestamp ?? Date.now(),
        userAttachments: attachments,
        model,
        abortSignal,
        queryClient,
        session,
        activeTool,
        memoryEnabled,
        thinkingEnabled,
        existingAssistantMessageId: placeholderAssistantId,
      },
      {
        onMessagesUpdate,
        saveToCacheMutate,
        onMemoryStatusUpdate,
        onArtifact: context.onArtifact,
      }
    );

    if (!result.success && result.error && result.error !== "aborted") {
      toast.error(TOAST_ERROR_MESSAGES.CHAT.FAILED_SEND, {
        description: toUserFriendlyError(result.error),
      });
    }

    return result;
  } catch (err) {
    if (!userMessageWasPersisted) {
      onMessagesUpdate((prev) =>
        prev.filter(
          (msg) => msg.id !== userMessage.id && msg.id !== placeholderAssistantId
        )
      );
    }

    if ((err as Error).name === "AbortError") {
      return { success: false, error: "aborted" };
    }

    const errorMessage = err instanceof Error ? err.message : HOOK_ERROR_MESSAGES.UNKNOWN_ERROR_OCCURRED;
    toast.error(TOAST_ERROR_MESSAGES.CHAT.FAILED_SEND, {
      description: errorMessage,
    });

    return { success: false, error: errorMessage };
  }
}
