import { type Message, type ToolActivity, type MessageMetadata, ToolStatus, MessageRole } from "@/lib/schemas/chat";
import { toast } from "sonner";
import { getModel } from "@/lib/storage";
import { DEFAULT_ASSISTANT_PROMPT } from "@/lib/prompts";
import { TOAST_ERROR_MESSAGES, HOOK_ERROR_MESSAGES } from "@/constants/errors";
import { deleteMessagesAfter, updateAssistantMessage } from "./message-api";
import { streamChatCompletion } from "./streaming-api";
import { buildCacheQuery } from "./cache-handler";
import { buildMessagesForAPI } from "./conversation-manager";
import { createNewVersion, buildUpdatedVersionsList, fetchMessageVersions, updateMessageWithVersions } from "./version-manager";
import type { MemoryStatus } from "@/types/chat";
import type { RegenerateContext } from "@/types/chat-hooks";

export async function handleRegenerateResponse(
  messageId: string,
  context: RegenerateContext,
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
  if (messageIndex === -1 || messageIndex === 0) {
    return { success: false, error: "Invalid message" };
  }

  const assistantMessage = messages[messageIndex];
  if (assistantMessage.role !== MessageRole.ASSISTANT) {
    return { success: false, error: "Not an assistant message" };
  }

  const previousUserMessage = messages[messageIndex - 1];
  if (previousUserMessage.role !== MessageRole.USER) {
    return { success: false, error: "No user message before assistant" };
  }

  const model = getModel();
  if (!model) {
    toast.error(TOAST_ERROR_MESSAGES.MODEL.NOT_SELECTED);
    return { success: false, error: "No model selected" };
  }

  const originalMessagesState = [...messages];
  const toolActivities: ToolActivity[] = [];
  let currentMemoryStatus: MemoryStatus | undefined;
  let messageMetadata: MessageMetadata | undefined;
  
  const messagesAfterAssistant = messages.slice(messageIndex + 1);
  
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
    toolActivities: [],
  };

  const messagesUpToAssistant = messages.slice(0, messageIndex);
  onMessagesUpdate(() => [...messagesUpToAssistant, updatedAssistantMessage, ...messagesAfterAssistant]);

  try {
    if (conversationId && assistantMessage.id) {
      await deleteMessagesAfter(conversationId, assistantMessage.id);
    }

    const cacheQuery = buildCacheQuery(messagesUpToAssistant, previousUserMessage.content);
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
            msg.id === assistantMessage.id
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
              msg.id === assistantMessage.id
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
      memoryEnabled,
      deepResearchEnabled: deepResearchEnabled ?? false,
    });

    onMessagesUpdate((prev) =>
      prev.map((msg) =>
        msg.id === assistantMessage.id
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

      if (conversationId && assistantMessage.id) {
        const updatedMessage = await updateAssistantMessage(conversationId, assistantMessage.id, responseContent, messageMetadata);
        
        if (updatedMessage?.id) {
          const parentId = updatedMessage.parentMessageId || updatedMessage.id;
          const versions = await fetchMessageVersions(conversationId, parentId);
          
          onMessagesUpdate((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessage.id || msg.id === updatedMessage.id
                ? { ...updateMessageWithVersions(msg, updatedMessage.id, versions), metadata: messageMetadata }
                : msg
            )
          );
        }
        
        queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] });
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
