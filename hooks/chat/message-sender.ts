import type { Message, Attachment } from "@/lib/schemas/chat";
import type { ConversationResult } from "@/types/chat";
import type { SearchDepth } from "@/lib/schemas/web-search.tools";
import { toast } from "sonner";
import { buildMultimodalContent } from "@/lib/content-utils";
import { getModel } from "@/lib/storage";
import { TOAST_ERROR_MESSAGES, HOOK_ERROR_MESSAGES } from "@/constants/errors";
import { saveUserMessage } from "./message-api";
import { handleConversationSaving } from "./conversation-manager";
import type { SendMessageContext, BaseChatContext } from "@/types/chat-hooks";
import { handleStreamingResponse } from "./streaming-handler";

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

  const lastMessage = messages[messages.length - 1];
  const existingEmptyAssistantId =
    lastMessage?.role === "assistant" &&
    !lastMessage.content &&
    lastMessage.id &&
    lastMessage.id.startsWith("assistant-")
      ? lastMessage.id
      : undefined;

  const result = await handleStreamingResponse(
    {
      messages: existingEmptyAssistantId ? messages.slice(0, -1) : messages,
      conversationId,
      userMessageContent: userMessage.content,
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
      existingAssistantMessageId: existingEmptyAssistantId,
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
  const placeholderAssistantId = conversationId ? `assistant-pending-${conversationId}` : undefined;

  if (!isNewConversation && placeholderAssistantId) {
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
  }

  try {
    let currentConversationId = conversationId;

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

      return { success: true };
    }

    if (!currentConversationId) {
      throw new Error("Conversation ID is required for existing conversations");
    }

    const savedMsgId = await saveUserMessage(currentConversationId, messageContent, attachments, abortSignal);
    if (savedMsgId) {
      onMessagesUpdate((prev) =>
        prev.map((msg) => (msg.id === userMessage.id ? { ...msg, id: savedMsgId } : msg))
      );
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
