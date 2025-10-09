import { type Message, type Attachment } from "@/lib/schemas/chat";
import { QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { buildMultimodalContent, extractTextFromContent } from "@/lib/content-utils";
import { getModel } from "@/lib/storage";
import { DEFAULT_ASSISTANT_PROMPT } from "@/lib/prompts";
import { TOAST_ERROR_MESSAGES, TOAST_SUCCESS_MESSAGES, HOOK_ERROR_MESSAGES } from "@/constants/errors";
import { saveUserMessage, storeMemory } from "./message-api";
import { streamChatCompletion } from "./streaming-api";
import { performCacheCheck } from "./cache-handler";
import { handleConversationSaving, buildMessagesForAPI } from "./conversation-manager";
import { type ConversationResult } from "./types";

interface SendMessageContext {
  messages: Message[];
  conversationId: string | null;
  abortSignal: AbortSignal;
  queryClient: QueryClient;
  onMessagesUpdate: (updater: (prev: Message[]) => Message[]) => void;
  onConversationIdUpdate: (id: string) => void;
  onNavigate: (path: string) => void;
  saveToCacheMutate: (data: { query: string; response: string }) => void;
}

export async function handleSendMessage(
  content: string,
  attachments: Attachment[] | undefined,
  context: SendMessageContext,
  session?: { user: { id: string } }
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

  const assistantMessageId = `assistant-${Date.now()}`;
  let assistantContent = "";

  onMessagesUpdate((prev) => [
    ...prev,
    userMessage,
    {
      role: "assistant",
      content: "",
      id: assistantMessageId,
      timestamp: Date.now(),
      model: model,
    },
  ]);

  try {
    let currentConversationId = conversationId;
    const isNewConversation = !currentConversationId;

    let savedUserMessageId: string | null = null;
    if (currentConversationId) {
      savedUserMessageId = await saveUserMessage(currentConversationId, messageContent, attachments);
      if (savedUserMessageId) {
        onMessagesUpdate((prev) =>
          prev.map((msg) =>
            msg.id === userMessage.id
              ? { ...msg, id: savedUserMessageId! }
              : msg
          )
        );
      }
    }

    const { cacheQuery, cacheData } = await performCacheCheck({
      messages,
      content: messageContent,
      attachments,
      abortSignal,
    });

    if (cacheData.cached && cacheData.response && typeof cacheData.response === 'string') {
      assistantContent = cacheData.response;
      onMessagesUpdate((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessageId
            ? { ...msg, content: assistantContent }
            : msg
        )
      );

      await handleConversationSaving(
        isNewConversation,
        currentConversationId,
        messageContent,
        assistantContent,
        userMessage.timestamp ?? Date.now(),
        queryClient,
        (data: ConversationResult) => {
          currentConversationId = data.conversationId;
          onConversationIdUpdate(data.conversationId);
          onMessagesUpdate((prev) =>
            prev.map((msg) => {
              if (msg.id === userMessage.id) {
                return { ...msg, id: data.userMessageId };
              }
              if (msg.id === assistantMessageId) {
                return { ...msg, id: data.assistantMessageId };
              }
              return msg;
            })
          );
          onNavigate(`/c/${data.conversationId}`);
        },
        attachments
      );

      return { success: true };
    }

    const messagesForAPI = buildMessagesForAPI(messages, messageContent, DEFAULT_ASSISTANT_PROMPT);

    const responseContent = await streamChatCompletion({
      messages: messagesForAPI,
      model,
      signal: abortSignal,
      onChunk: (fullContent) => {
        onMessagesUpdate((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? { ...msg, content: fullContent }
              : msg
          )
        );
      },
      conversationId: currentConversationId,
    });

    assistantContent = responseContent;

    if (assistantContent && !abortSignal.aborted) {
      if (cacheQuery) {
        saveToCacheMutate({
          query: cacheQuery,
          response: assistantContent,
        });
      }

      await handleConversationSaving(
        isNewConversation,
        currentConversationId,
        messageContent,
        assistantContent,
        userMessage.timestamp ?? Date.now(),
        queryClient,
        (data: ConversationResult) => {
          currentConversationId = data.conversationId;
          onConversationIdUpdate(data.conversationId);
          onMessagesUpdate((prev) =>
            prev.map((msg) => {
              if (msg.id === userMessage.id) {
                return { ...msg, id: data.userMessageId };
              }
              if (msg.id === assistantMessageId) {
                return { ...msg, id: data.assistantMessageId };
              }
              return msg;
            })
          );
          onNavigate(`/c/${data.conversationId}`);
        },
        attachments
      );

      if (session?.user?.id) {
        const textContent = extractTextFromContent(messageContent);
        await storeMemory(textContent, assistantContent, currentConversationId);
      }
    }

    return { success: true };
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      toast.info(TOAST_SUCCESS_MESSAGES.GENERATION_STOPPED);
      return { success: false, error: "aborted" };
    }
    
    const errorMessage = err instanceof Error ? err.message : HOOK_ERROR_MESSAGES.UNKNOWN_ERROR_OCCURRED;
    toast.error(TOAST_ERROR_MESSAGES.CHAT.FAILED_SEND, {
      description: errorMessage,
    });
    
    onMessagesUpdate((prev) => prev.filter((msg) => msg.id !== assistantMessageId));
    return { success: false, error: errorMessage };
  }
}
