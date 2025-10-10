import { type Message, type Attachment } from "@/lib/schemas/chat";
import { QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { buildMultimodalContent } from "@/lib/content-utils";
import { getModel } from "@/lib/storage";
import { DEFAULT_ASSISTANT_PROMPT } from "@/lib/prompts";
import { TOAST_ERROR_MESSAGES, TOAST_SUCCESS_MESSAGES, HOOK_ERROR_MESSAGES } from "@/constants/errors";
import { updateUserMessage, saveAssistantMessage } from "./message-api";
import { streamChatCompletion } from "./streaming-api";
import { performCacheCheck } from "./cache-handler";
import { buildMessagesForAPI } from "./conversation-manager";
import { createNewVersion, buildUpdatedVersionsList, fetchMessageVersions, updateMessageWithVersions } from "./version-manager";
import { type MemoryStatus } from "./types";

interface EditMessageContext {
  messages: Message[];
  conversationId: string | null;
  abortSignal: AbortSignal;
  queryClient: QueryClient;
  onMessagesUpdate: (updater: (prev: Message[]) => Message[]) => void;
  saveToCacheMutate: (data: { query: string; response: string }) => void;
  onMemoryStatusUpdate?: (status: MemoryStatus) => void;
}

export async function handleEditMessage(
  messageId: string,
  newContent: string,
  attachments: Attachment[] | undefined,
  context: EditMessageContext
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

  const messageIndex = messages.findIndex((m) => m.id === messageId);
  if (messageIndex === -1) return { success: false, error: "Message not found" };

  const messageToEdit = messages[messageIndex];
  if (messageToEdit.role !== "user") return { success: false, error: "Cannot edit assistant message" };

  const model = getModel();
  if (!model) {
    toast.error(TOAST_ERROR_MESSAGES.MODEL.NOT_SELECTED);
    return { success: false, error: "No model selected" };
  }

  const messageContent = buildMultimodalContent(newContent, attachments);
  const assistantMessageId = `assistant-${Date.now()}`;
  const messagesUpToEdit = messages.slice(0, messageIndex);
  const originalMessagesState = [...messages];
  
  const newEditedVersion = createNewVersion(
    messageToEdit.versions || [],
    "user",
    messageContent,
    `temp-edit-${Date.now()}`,
    undefined,
    attachments
  );
  
  const updatedVersions = buildUpdatedVersionsList(messageToEdit, newEditedVersion, true);
  
  onMessagesUpdate(() => [
    ...messagesUpToEdit,
    {
      ...messageToEdit,
      content: messageContent,
      attachments,
      versions: updatedVersions,
    },
    {
      role: "assistant",
      content: "",
      id: assistantMessageId,
      timestamp: Date.now(),
      model: model,
    },
  ]);

  try {
    let updatedMessageId = messageToEdit.id;
    let updatedMessageData: { parentMessageId?: string | null } | null = null;
    if (conversationId && messageToEdit.id) {
      const updatedMessage = await updateUserMessage(conversationId, messageToEdit.id, messageContent, attachments, abortSignal);
      if (updatedMessage?.id) {
        updatedMessageId = updatedMessage.id;
        updatedMessageData = { parentMessageId: updatedMessage.parentMessageId };
      }
    }

    const { cacheQuery, cacheData } = await performCacheCheck({
      messages: messagesUpToEdit,
      content: messageContent,
      attachments,
      abortSignal,
    });

    if (cacheData.cached && cacheData.response && typeof cacheData.response === 'string') {
      const assistantContent = cacheData.response;
      onMessagesUpdate((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessageId
            ? { ...msg, content: assistantContent }
            : msg
        )
      );

      if (conversationId) {
        const conversationIdStr = conversationId;
        const savedAssistantMessageId = await saveAssistantMessage(conversationIdStr, assistantContent);
        
        if (savedAssistantMessageId && updatedMessageId) {
          const parentId = updatedMessageData?.parentMessageId || updatedMessageId;
          const versions = await fetchMessageVersions(conversationIdStr, parentId);
          
          onMessagesUpdate((prev) =>
            prev.map((msg) => {
              if (msg.id === messageToEdit.id || msg.id === updatedMessageId) {
                return updateMessageWithVersions(msg, updatedMessageId, versions);
              }
              if (msg.id === assistantMessageId) {
                return { ...msg, id: savedAssistantMessageId };
              }
              return msg;
            })
          );
        }
      }

      return { success: true };
    }

    const messagesForAPI = buildMessagesForAPI(messagesUpToEdit, messageContent, DEFAULT_ASSISTANT_PROMPT);

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
      conversationId,
      onMemoryStatus: onMemoryStatusUpdate,
    });

    if (responseContent && !abortSignal.aborted) {
      if (cacheQuery) {
        saveToCacheMutate({
          query: cacheQuery,
          response: responseContent,
        });
      }

      if (conversationId) {
        const conversationIdStr = conversationId;
        const savedAssistantMessageId = await saveAssistantMessage(conversationIdStr, responseContent);
        
        if (savedAssistantMessageId && updatedMessageId) {
          const parentId = updatedMessageData?.parentMessageId || updatedMessageId;
          const versions = await fetchMessageVersions(conversationIdStr, parentId);
          
          onMessagesUpdate((prev) =>
            prev.map((msg) => {
              if (msg.id === messageToEdit.id || msg.id === updatedMessageId) {
                return updateMessageWithVersions(msg, updatedMessageId, versions);
              }
              if (msg.id === assistantMessageId) {
                return { ...msg, id: savedAssistantMessageId };
              }
              return msg;
            })
          );
        }
        
        queryClient.invalidateQueries({ queryKey: ['conversation', conversationIdStr] });
      }
    }

    return { success: true };
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      onMessagesUpdate(() => messagesUpToEdit);
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
