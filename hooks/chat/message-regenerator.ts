import { type Message } from "@/lib/schemas/chat";
import { QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getModel } from "@/lib/storage";
import { DEFAULT_ASSISTANT_PROMPT } from "@/lib/prompts";
import { TOAST_ERROR_MESSAGES, TOAST_SUCCESS_MESSAGES, HOOK_ERROR_MESSAGES } from "@/constants/errors";
import { deleteMessagesAfter, updateAssistantMessage } from "./message-api";
import { streamChatCompletion } from "./streaming-api";
import { performCacheCheck } from "./cache-handler";
import { buildMessagesForAPI } from "./conversation-manager";
import { createNewVersion, buildUpdatedVersionsList, fetchMessageVersions, updateMessageWithVersions } from "./version-manager";

interface RegenerateContext {
  messages: Message[];
  conversationId: string | null;
  abortSignal: AbortSignal;
  queryClient: QueryClient;
  onMessagesUpdate: (updater: (prev: Message[]) => Message[]) => void;
  saveToCacheMutate: (data: { query: string; response: string }) => void;
}

export async function handleRegenerateResponse(
  messageId: string,
  context: RegenerateContext
): Promise<{ success: boolean; error?: string }> {
  const {
    messages,
    conversationId,
    abortSignal,
    queryClient,
    onMessagesUpdate,
    saveToCacheMutate,
  } = context;

  const messageIndex = messages.findIndex((m) => m.id === messageId);
  if (messageIndex === -1 || messageIndex === 0) {
    return { success: false, error: "Invalid message" };
  }

  const assistantMessage = messages[messageIndex];
  if (assistantMessage.role !== "assistant") {
    return { success: false, error: "Not an assistant message" };
  }

  const previousUserMessage = messages[messageIndex - 1];
  if (previousUserMessage.role !== "user") {
    return { success: false, error: "No user message before assistant" };
  }

  const model = getModel();
  if (!model) {
    toast.error(TOAST_ERROR_MESSAGES.MODEL.NOT_SELECTED);
    return { success: false, error: "No model selected" };
  }

  const originalMessagesState = [...messages];
  
  const newRegeneratedVersion = createNewVersion(
    assistantMessage.versions || [],
    "assistant",
    "",
    `temp-regen-${Date.now()}`,
    model,
    []
  );
  
  const updatedVersions = buildUpdatedVersionsList(assistantMessage, newRegeneratedVersion, true);

  const updatedAssistantMessage: Message = {
    ...assistantMessage,
    content: "",
    versions: updatedVersions,
  };

  const messagesUpToAssistant = messages.slice(0, messageIndex);
  onMessagesUpdate(() => [...messagesUpToAssistant, updatedAssistantMessage]);

  try {
    if (conversationId && assistantMessage.id) {
      await deleteMessagesAfter(conversationId, assistantMessage.id);
    }

    const { cacheQuery, cacheData } = await performCacheCheck({
      messages: messagesUpToAssistant,
      content: previousUserMessage.content,
      attachments: previousUserMessage.attachments,
      abortSignal,
    });

    if (cacheData.cached && cacheData.response && typeof cacheData.response === 'string') {
      const cachedResponse = cacheData.response;
      onMessagesUpdate((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessage.id
            ? { ...msg, content: cachedResponse }
            : msg
        )
      );

      if (conversationId && assistantMessage.id) {
        const updatedMessage = await updateAssistantMessage(conversationId, assistantMessage.id, cachedResponse);
        
        if (updatedMessage?.id) {
          const parentId = updatedMessage.parentMessageId || updatedMessage.id;
          const versions = await fetchMessageVersions(conversationId, parentId);
          
          onMessagesUpdate((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessage.id || msg.id === updatedMessage.id
                ? updateMessageWithVersions(msg, updatedMessage.id, versions)
                : msg
            )
          );
        }
      }

      return { success: true };
    }

    const messagesForAPI = buildMessagesForAPI(messagesUpToAssistant, previousUserMessage.content, DEFAULT_ASSISTANT_PROMPT);

    const responseContent = await streamChatCompletion({
      messages: messagesForAPI,
      model,
      signal: abortSignal,
      onChunk: (fullContent) => {
        onMessagesUpdate((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessage.id
              ? { ...msg, content: fullContent }
              : msg
          )
        );
      },
      conversationId,
    });

    if (responseContent && !abortSignal.aborted) {
      if (cacheQuery) {
        saveToCacheMutate({
          query: cacheQuery,
          response: responseContent,
        });
      }

      if (conversationId && assistantMessage.id) {
        const updatedMessage = await updateAssistantMessage(conversationId, assistantMessage.id, responseContent);
        
        if (updatedMessage?.id) {
          const parentId = updatedMessage.parentMessageId || updatedMessage.id;
          const versions = await fetchMessageVersions(conversationId, parentId);
          
          onMessagesUpdate((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessage.id || msg.id === updatedMessage.id
                ? updateMessageWithVersions(msg, updatedMessage.id, versions)
                : msg
            )
          );
        }
        
        queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] });
      }
    }

    return { success: true };
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      onMessagesUpdate(() => messagesUpToAssistant);
      toast.info(TOAST_SUCCESS_MESSAGES.GENERATION_STOPPED);
      return { success: false, error: "aborted" };
    }
    
    const errorMessage = err instanceof Error ? err.message : HOOK_ERROR_MESSAGES.UNKNOWN_ERROR_OCCURRED;
    toast.error(TOAST_ERROR_MESSAGES.CHAT.FAILED_SEND, {
      description: errorMessage,
    });
    
    onMessagesUpdate(() => originalMessagesState);
    return { success: false, error: errorMessage };
  }
}
