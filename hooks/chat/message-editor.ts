import { type Attachment, type ToolActivity, type MessageMetadata, ToolStatus, MessageRole } from "@/lib/schemas/chat";
import { toast } from "sonner";
import { buildMultimodalContent } from "@/lib/content-utils";
import { getModel } from "@/lib/storage";
import { DEFAULT_ASSISTANT_PROMPT } from "@/lib/prompts";
import { TOAST_ERROR_MESSAGES, HOOK_ERROR_MESSAGES } from "@/constants/errors";
import { updateUserMessage, saveAssistantMessage } from "./message-api";
import { streamChatCompletion } from "./streaming-api";
import { buildCacheQuery } from "./cache-handler";
import { buildMessagesForAPI } from "./conversation-manager";
import { createNewVersion, buildUpdatedVersionsList, fetchMessageVersions, updateMessageWithVersions } from "./version-manager";
import type { MemoryStatus } from "@/types/chat";
import type { EditMessageContext } from "@/types/chat-hooks";

export async function handleEditMessage(
  messageId: string,
  newContent: string,
  attachments: Attachment[] | undefined,
  context: EditMessageContext,
  activeTool?: string | null,
  memoryEnabled?: boolean,
  deepResearchEnabled?: boolean
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
  if (messageToEdit.role !== MessageRole.USER) return { success: false, error: "Cannot edit assistant message" };

  const model = getModel();
  if (!model) {
    toast.error(TOAST_ERROR_MESSAGES.MODEL.NOT_SELECTED);
    return { success: false, error: "No model selected" };
  }

  const messageContent = buildMultimodalContent(newContent, attachments);
  const assistantMessageId = `assistant-${Date.now()}`;
  const messagesUpToEdit = messages.slice(0, messageIndex);
  const originalMessagesState = [...messages];
  const toolActivities: ToolActivity[] = [];
  let currentMemoryStatus: MemoryStatus | undefined;
  let messageMetadata: MessageMetadata = {};
  
  const nextAssistantIndex = messages.findIndex((m, idx) => idx > messageIndex && m.role === MessageRole.ASSISTANT);
  const messagesAfterAssistant = nextAssistantIndex !== -1 ? messages.slice(nextAssistantIndex + 1) : [];
  
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
      toolActivities: [],
    },
    ...messagesAfterAssistant,
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

    const cacheQuery = buildCacheQuery(messagesUpToEdit, messageContent);
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
      onMemoryStatus: (status) => {
        currentMemoryStatus = status;
        onMemoryStatusUpdate?.(status);
      },
      onToolCall: (toolCall) => {
        const activity: ToolActivity = {
          toolCallId: toolCall.toolCallId,
          toolName: toolCall.toolName,
          status: ToolStatus.Calling,
          args: toolCall.args,
          timestamp: Date.now(),
        };
        
        toolActivities.push(activity);
        
        onMessagesUpdate((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? { ...msg, toolActivities: [...toolActivities] }
              : msg
          )
        );
      },
      onToolResult: (toolResult) => {
        const activityIndex = toolActivities.findIndex(
          (a) => a.toolCallId === toolResult.toolCallId
        );
        
        if (activityIndex !== -1) {
          toolActivities[activityIndex] = {
            ...toolActivities[activityIndex],
            status: ToolStatus.Completed,
            result: toolResult.result,
            timestamp: Date.now(),
          };
          
          onMessagesUpdate((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessageId
                ? { ...msg, toolActivities: [...toolActivities] }
                : msg
            )
          );
        }
      },
      onToolProgress: (progress) => {
        if (currentMemoryStatus && onMemoryStatusUpdate) {
          const updatedStatus: MemoryStatus = {
            ...currentMemoryStatus,
            toolProgress: {
              status: progress.status,
              message: progress.message,
              details: {
                ...(currentMemoryStatus.toolProgress?.details || {}),
                ...(progress.details || {}),
              },
            },
          };
          currentMemoryStatus = updatedStatus;
          onMemoryStatusUpdate(updatedStatus);
          
          if (progress.details) {
            if ('sources' in progress.details && Array.isArray(progress.details.sources)) {
              const details = progress.details as { sources?: MessageMetadata['sources'] };
              messageMetadata = {
                ...(messageMetadata || {}),
                ...(details.sources && details.sources.length > 0 && { sources: details.sources }),
              };
            }
            
            const details = progress.details as { citations?: MessageMetadata['citations']; followUpQuestions?: string[] };
            
            if ('citations' in details && details.citations) {
              messageMetadata = {
                ...(messageMetadata || {}),
                citations: details.citations,
              };
            }
            
            if ('followUpQuestions' in details && details.followUpQuestions) {
              messageMetadata = {
                ...(messageMetadata || {}),
                followUpQuestions: details.followUpQuestions,
              };
            }
          }
        }
      },
      onUsageUpdated: () => {
        queryClient.invalidateQueries({ queryKey: ['deep-research-usage'] });
      },
      activeTool,
      memoryEnabled: memoryEnabled ?? true,
      deepResearchEnabled: deepResearchEnabled ?? false,
    });

    onMessagesUpdate((prev) =>
      prev.map((msg) =>
        msg.id === assistantMessageId
          ? { ...msg, metadata: messageMetadata }
          : msg
      )
    );

    if (responseContent && !abortSignal.aborted) {
      if (cacheQuery) {
        saveToCacheMutate({
          query: cacheQuery,
          response: responseContent,
        });
      }

      if (conversationId) {
        const conversationIdStr = conversationId;
        const savedAssistantMessageId = await saveAssistantMessage(conversationIdStr, responseContent, messageMetadata);
        
        if (savedAssistantMessageId && updatedMessageId) {
          const parentId = updatedMessageData?.parentMessageId || updatedMessageId;
          const versions = await fetchMessageVersions(conversationIdStr, parentId);
          
          onMessagesUpdate((prev) =>
            prev.map((msg) => {
              if (msg.id === messageToEdit.id || msg.id === updatedMessageId) {
                return updateMessageWithVersions(msg, updatedMessageId, versions);
              }
              if (msg.id === assistantMessageId) {
                return { ...msg, id: savedAssistantMessageId, metadata: messageMetadata };
              }
              return msg;
            })
          );
        }
        
        queryClient.invalidateQueries({ queryKey: ['conversation', conversationIdStr] });
        queryClient.invalidateQueries({ queryKey: ['conversations'] });
      }
    }

    return { success: true };
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      onMessagesUpdate(() => originalMessagesState);
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
