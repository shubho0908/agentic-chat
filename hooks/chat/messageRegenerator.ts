import { type JsonValue, type Message, type ToolActivity, type MessageMetadata, ToolStatus, MessageRole } from "@/lib/schemas/chat";
import { toast } from "sonner";
import type { SearchDepth } from "@/lib/schemas/webSearchTools";
import { getModel } from "@/lib/storage";
import { DEFAULT_ASSISTANT_PROMPT } from "@/lib/prompts";
import { TOAST_ERROR_MESSAGES, HOOK_ERROR_MESSAGES } from "@/constants/errors";
import { updateAssistantMessage } from "./messageApi";
import { streamChatCompletion } from "./streamingApi";
import { buildCacheQuery, shouldUseSemanticCache } from "./cacheHandler";
import { buildMessagesForAPI } from "./conversationManager";
import type { MemoryStatus } from "@/types/chat";
import type { RegenerateContext } from "@/types/chatHooks";
import { persistConversationMemoryIfEligible } from "./memoryPersistence";
import { fetchMessageVersions, updateMessageWithVersions } from "./versionManager";


import { logger } from "@/lib/logger";
function toJsonValue(value: unknown): JsonValue | undefined {
  if (value === undefined) {
    return undefined;
  }

  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

export async function handleRegenerateResponse(
  messageId: string,
  context: RegenerateContext,
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

  const updatedAssistantMessage: Message = {
    ...assistantMessage,
    content: "",
    toolActivities: [],
    metadata: undefined,
  };

  const messagesUpToAssistant = messages.slice(0, messageIndex);
  onMessagesUpdate(() => [...messagesUpToAssistant, updatedAssistantMessage, ...messagesAfterAssistant]);

  try {
    const useCaching = shouldUseSemanticCache(
      messagesUpToAssistant,
      previousUserMessage.attachments,
      activeTool,
      deepResearchEnabled
    );
    const cacheQuery = useCaching ? buildCacheQuery(messagesUpToAssistant, previousUserMessage.content) : '';
    const messagesForAPI = buildMessagesForAPI(messagesUpToAssistant, previousUserMessage.content, DEFAULT_ASSISTANT_PROMPT, model);

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
            result: toJsonValue(toolResult.result),
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

            if ('images' in progress.details && Array.isArray(progress.details.images)) {
              const details = progress.details as { images?: MessageMetadata['images'] };
              messageMetadata = {
                ...(messageMetadata || {}),
                ...(details.images && details.images.length > 0 && { images: details.images }),
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
        queryClient.invalidateQueries({ queryKey: ['deepResearchUsage'] });
      },
      activeTool,
      memoryEnabled: memoryEnabled ?? true,
      deepResearchEnabled: deepResearchEnabled ?? false,
      searchDepth: searchDepth ?? 'basic',
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
        const updatedAssistant = await updateAssistantMessage(
          conversationId,
          assistantMessage.id,
          responseContent,
          messageMetadata
        );
        const parentId = updatedAssistant.parentMessageId || updatedAssistant.id;
        let versions: Message[] = [];

        try {
          versions = await fetchMessageVersions(conversationId, parentId);
        } catch (versionError) {
          logger.warn('Failed to fetch message versions after regeneration:', versionError);
        }

        onMessagesUpdate((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessage.id
              ? updateMessageWithVersions(
                  {
                    ...msg,
                    metadata: messageMetadata,
                  },
                  updatedAssistant.id,
                  versions
                )
              : msg
          )
        );
        
        queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] });
        queryClient.invalidateQueries({ queryKey: ['conversations'] });
      }

      persistConversationMemoryIfEligible({
        userMessageContent: previousUserMessage.content,
        assistantContent: responseContent,
        userId: context.session?.user?.id,
        memoryEnabled: memoryEnabled ?? true,
        activeTool,
        deepResearchEnabled: deepResearchEnabled ?? false,
        userAttachments: previousUserMessage.attachments,
        memoryStatus: currentMemoryStatus,
        flow: "regenerate",
      });
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
