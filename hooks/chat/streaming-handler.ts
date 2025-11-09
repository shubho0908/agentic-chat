import type { Message, ToolActivity, MessageMetadata } from "@/lib/schemas/chat";
import { ToolStatus } from "@/lib/schemas/chat";
import type { MemoryStatus } from "@/types/chat";
import type { SearchDepth } from "@/lib/schemas/web-search.tools";
import type { QueryClient } from "@tanstack/react-query";
import { extractTextFromContent } from "@/lib/content-utils";
import { streamChatCompletion } from "./streaming-api";
import { performCacheCheck } from "./cache-handler";
import { handleConversationSaving, buildMessagesForAPI } from "./conversation-manager";
import { storeConversationMemory } from "@/lib/memory";
import { DEFAULT_ASSISTANT_PROMPT } from "@/lib/prompts";
import { HOOK_ERROR_MESSAGES } from "@/constants/errors";

interface StreamingContext {
  messages: Message[];
  conversationId: string;
  userMessageContent: string | Message["content"];
  userTimestamp: number;
  userAttachments?: Message["attachments"];
  model: string;
  abortSignal: AbortSignal;
  queryClient: QueryClient;
  session?: { user: { id: string } };
  activeTool?: string | null;
  memoryEnabled?: boolean;
  deepResearchEnabled?: boolean;
  searchDepth?: SearchDepth;
  existingAssistantMessageId?: string;
}

interface StreamingCallbacks {
  onMessagesUpdate: (updater: (prev: Message[]) => Message[]) => void;
  saveToCacheMutate: (data: { query: string; response: string }) => void;
  onMemoryStatusUpdate?: (status: MemoryStatus) => void;
}

interface StreamingResult {
  success: boolean;
  error?: string;
  assistantMessageId?: string;
}

function extractMetadataFromProgress(
  progress: { details?: Record<string, unknown> },
  currentMetadata?: MessageMetadata
): MessageMetadata | undefined {
  if (!progress.details) return currentMetadata;

  let metadata = currentMetadata || {};

  if ('sources' in progress.details && Array.isArray(progress.details.sources)) {
    const details = progress.details as { sources?: MessageMetadata['sources'] };
    if (details.sources && details.sources.length > 0) {
      metadata = { ...metadata, sources: details.sources };
    }
  }

  if ('images' in progress.details && Array.isArray(progress.details.images)) {
    const details = progress.details as { images?: MessageMetadata['images'] };
    if (details.images && details.images.length > 0) {
      metadata = { ...metadata, images: details.images };
    }
  }

  const details = progress.details as {
    citations?: MessageMetadata['citations'];
    followUpQuestions?: string[];
  };

  if ('citations' in details && details.citations) {
    metadata = { ...metadata, citations: details.citations };
  }

  if ('followUpQuestions' in details && details.followUpQuestions) {
    metadata = { ...metadata, followUpQuestions: details.followUpQuestions };
  }

  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

function updateAssistantMessage(
  onMessagesUpdate: (updater: (prev: Message[]) => Message[]) => void,
  assistantMessageId: string,
  updates: Partial<Message>
): void {
  onMessagesUpdate((prev) =>
    prev.map((msg) =>
      msg.id === assistantMessageId
        ? { ...msg, ...updates }
        : msg
    )
  );
}

export async function handleStreamingResponse(
  context: StreamingContext,
  callbacks: StreamingCallbacks
): Promise<StreamingResult> {
  const {
    messages,
    conversationId,
    userMessageContent,
    userTimestamp,
    userAttachments,
    model,
    abortSignal,
    queryClient,
    session,
    activeTool,
    memoryEnabled = true,
    deepResearchEnabled = false,
    searchDepth,
    existingAssistantMessageId,
  } = context;

  const { onMessagesUpdate, saveToCacheMutate, onMemoryStatusUpdate } = callbacks;
  const assistantMessageId = existingAssistantMessageId || `assistant-pending-${conversationId}`;
  let assistantContent = "";
  const toolActivities: ToolActivity[] = [];
  let currentMemoryStatus: MemoryStatus | undefined;
  let messageMetadata: MessageMetadata | undefined;
  let messageCreated = !!existingAssistantMessageId;

  try {
    const { cacheQuery, cacheData } = await performCacheCheck({
      messages,
      content: userMessageContent,
      attachments: userAttachments,
      abortSignal,
      activeTool,
      deepResearchEnabled,
    });

    if (cacheData.cached && cacheData.response !== undefined && typeof cacheData.response === 'string') {
      assistantContent = cacheData.response;
      
      if (existingAssistantMessageId) {
        updateAssistantMessage(onMessagesUpdate, assistantMessageId, {
          content: assistantContent,
        });
      } else {
        onMessagesUpdate((prev) => [
          ...prev,
          {
            role: "assistant",
            content: assistantContent,
            id: assistantMessageId,
            timestamp: Date.now(),
            model,
            toolActivities: [],
          },
        ]);
      }
      await handleConversationSaving(
        false,
        conversationId,
        userMessageContent,
        assistantContent,
        userTimestamp,
        queryClient,
        (data) => {
          updateAssistantMessage(onMessagesUpdate, assistantMessageId, {
            id: data.assistantMessageId,
          });
        },
        undefined,
        false,
        undefined,
        undefined 
      );

      return { success: true, assistantMessageId };
    }

    const messagesForAPI = buildMessagesForAPI(messages, userMessageContent, DEFAULT_ASSISTANT_PROMPT);

    const responseContent = await streamChatCompletion({
      messages: messagesForAPI,
      model,
      signal: abortSignal,
      onChunk: (fullContent) => {
        if (!messageCreated) {
          messageCreated = true;
          onMessagesUpdate((prev) => [
            ...prev,
            {
              role: "assistant",
              content: fullContent,
              id: assistantMessageId,
              timestamp: Date.now(),
              model,
              toolActivities: [],
            },
          ]);
        } else {
          updateAssistantMessage(onMessagesUpdate, assistantMessageId, {
            content: fullContent,
          });
        }
      },
      conversationId,
      onMemoryStatus: (status) => {
        currentMemoryStatus = status;
        onMemoryStatusUpdate?.(status);
        if (!messageCreated) {
          messageCreated = true;
          onMessagesUpdate((prev) => [
            ...prev,
            {
              role: "assistant",
              content: "",
              id: assistantMessageId,
              timestamp: Date.now(),
              model,
              toolActivities: [],
            },
          ]);
        }
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

        if (!messageCreated) {
          messageCreated = true;
          onMessagesUpdate((prev) => [
            ...prev,
            {
              role: "assistant",
              content: "",
              id: assistantMessageId,
              timestamp: Date.now(),
              model,
              toolActivities: [...toolActivities],
            },
          ]);
        } else {
          updateAssistantMessage(onMessagesUpdate, assistantMessageId, {
            toolActivities: [...toolActivities],
          });
        }
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

          updateAssistantMessage(onMessagesUpdate, assistantMessageId, {
            toolActivities: [...toolActivities],
          });
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
          messageMetadata = extractMetadataFromProgress(progress, messageMetadata);
        }
      },
      onUsageUpdated: () => {
        queryClient.invalidateQueries({ queryKey: ['deep-research-usage'] });
      },
      activeTool,
      memoryEnabled,
      deepResearchEnabled,
      searchDepth,
    });

    assistantContent = responseContent;

    if (messageMetadata) {
      updateAssistantMessage(onMessagesUpdate, assistantMessageId, {
        metadata: messageMetadata,
      });
    }

    if (assistantContent !== undefined && !abortSignal.aborted) {
      if (cacheQuery) {
        saveToCacheMutate({
          query: cacheQuery,
          response: assistantContent,
        });
      }
      await handleConversationSaving(
        false,
        conversationId,
        userMessageContent,
        assistantContent,
        userTimestamp,
        queryClient,
        (data) => {
          updateAssistantMessage(onMessagesUpdate, assistantMessageId, {
            id: data.assistantMessageId,
            metadata: messageMetadata,
          });
        },
        undefined,
        false,
        undefined,
        messageMetadata
      );

      if (session?.user?.id && memoryEnabled && !deepResearchEnabled) {
        const textContent = extractTextFromContent(userMessageContent);
        storeConversationMemory(textContent, assistantContent, session.user.id).catch((err) => {
          console.error('[Memory] Failed to store conversation memory:', err);
        });
      }
    }

    return { success: true, assistantMessageId };
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      if (messageCreated) {
        onMessagesUpdate((prev) => prev.filter((msg) => msg.id !== assistantMessageId));
      }
      return { success: false, error: "aborted" };
    }

    const errorMessage = err instanceof Error ? err.message : HOOK_ERROR_MESSAGES.UNKNOWN_ERROR_OCCURRED;
    if (messageCreated) {
      onMessagesUpdate((prev) => prev.filter((msg) => msg.id !== assistantMessageId));
    }
    return { success: false, error: errorMessage };
  }
}
