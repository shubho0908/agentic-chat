import type { Message, Attachment } from "@/lib/schemas/chat";
import type { ConversationResult } from "@/types/chat";
import type { SearchDepth } from "@/lib/schemas/webSearchTools";
import { toast } from "sonner";
import { buildMultimodalContent } from "@/lib/contentUtils";
import { getModel } from "@/lib/storage";
import { TOAST_ERROR_MESSAGES, HOOK_ERROR_MESSAGES } from "@/constants/errors";
import { saveUserMessage } from "./messageApi";
import { handleConversationSaving } from "./conversationManager";
import type { SendMessageContext, BaseChatContext } from "@/types/chatHooks";
import { handleStreamingResponse } from "./streamingHandler";
import { getResumeConversationState } from "./resumeState";

export async function continueIncompleteConversation(
  userMessage: Message,
  context: BaseChatContext,
  session?: { user: { id: string } },
  activeTool?: string | null,
  memoryEnabled?: boolean,
  deepResearchEnabled?: boolean,
  searchDepth?: SearchDepth
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
      deepResearchEnabled,
      searchDepth,
      existingAssistantMessageId,
    },
    {
      onMessagesUpdate,
      saveToCacheMutate,
      onMemoryStatusUpdate,
    }
  );

  if (!result.success && result.error && result.error !== "aborted") {
    toast.error(TOAST_ERROR_MESSAGES.CHAT.FAILED_SEND, {
      description: result.error,
    });
  }

  return result;
}

export async function handleSendMessage(
  content: string,
  attachments: Attachment[] | undefined,
  context: SendMessageContext,
  session?: { user: { id: string } },
  activeTool?: string | null,
  memoryEnabled?: boolean,
  deepResearchEnabled?: boolean,
  searchDepth?: SearchDepth
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
    role: "user",
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
      role: "assistant",
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
    let shouldResumeOnConversationPage = false;

    if (isNewConversation) {
      await handleConversationSaving(
        true,
        null,
        messageContent,
        "",
        userMessage.timestamp ?? Date.now(),
        queryClient,
        (data: ConversationResult) => {
          currentConversationId = data.conversationId;
          onMessagesUpdate((prev) =>
            prev.map((msg) =>
              msg.id === userMessage.id ? { ...msg, id: data.userMessageId } : msg
            )
          );
          userMessageWasPersisted = true;
          onConversationIdUpdate(data.conversationId);
          queryClient.invalidateQueries({ queryKey: ["conversations"] });
          onNavigate(`/c/${data.conversationId}`);
        },
        attachments,
        true,
        abortSignal,
        undefined
      );

      if (!currentConversationId) {
        throw new Error("Failed to create conversation");
      }

      // New chats navigate to /c/:id immediately after the user message is saved.
      // Let the destination page resume generation once, instead of starting a
      // stream here that will be aborted during route teardown and retried there.
      shouldResumeOnConversationPage = true;
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

    if (shouldResumeOnConversationPage) {
      return { success: true };
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
        deepResearchEnabled,
        searchDepth,
        existingAssistantMessageId: placeholderAssistantId,
      },
      {
        onMessagesUpdate,
        saveToCacheMutate,
        onMemoryStatusUpdate,
      }
    );

    if (!result.success && result.error && result.error !== "aborted") {
      toast.error(TOAST_ERROR_MESSAGES.CHAT.FAILED_SEND, {
        description: result.error,
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
