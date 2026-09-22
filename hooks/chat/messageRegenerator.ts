import { type Message, type ToolActivity, type MessageMetadata, ToolStatus, MessageRole } from "@/lib/schemas/chat";
import type { ReasoningEffortLevel } from "@/constants/openai-models";
import { toast } from "sonner";
import { getModel } from "@/lib/storage";
import { DEFAULT_ASSISTANT_PROMPT } from "@/lib/prompts";
import { TOAST_ERROR_MESSAGES } from "@/constants/errors";
import { updateAssistantMessage } from "./messageApi";
import { streamChatCompletion } from "./streamingApi";
import { extractMetadataFromProgress, extractPdfFromToolResult } from "./streamingHandler";
import { buildCacheQuery, shouldUseSemanticCache } from "./cacheHandler";
import { buildMessagesForAPI, getPersistableAssistantContent } from "./conversationManager";
import type { MemoryStatus } from "@/types/chat";
import type { RegenerateContext } from "@/types/chatHooks";
import { persistConversationMemoryIfEligible } from "./memoryPersistence";
import { fetchMessageVersions, updateMessageWithVersions } from "./versionManager";
import { queryKeys } from "@/lib/queryKeys";
import { toUserFriendlyError } from "@/lib/errorMessages";
import { toJsonValue } from "@/lib/json";

import { logger } from "@/lib/logger";
import { ArtifactEventType } from "@/types/artifact";
import { createArtifactMetadataCollector } from "@/lib/artifacts/metadata";

export async function handleRegenerateResponse(
  messageId: string,
  context: RegenerateContext,
  activeTool?: string | null,
  reasoningEffort?: ReasoningEffortLevel
): Promise<{ success: boolean; error?: string }> {
  const {
    messages,
    conversationId,
    abortSignal,
    queryClient,
    onMessagesUpdate,
    saveToCacheMutate,
    onMemoryStatusUpdate,
    onBranchIdUpdate,
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
  const artifactCollector = createArtifactMetadataCollector();
  let responseIncomplete = false;
  let responseContent = "";
  
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
      activeTool
    );
    const cacheQuery = useCaching ? buildCacheQuery(messagesUpToAssistant, previousUserMessage.content) : '';
    const messagesForAPI = buildMessagesForAPI(messagesUpToAssistant, previousUserMessage.content, DEFAULT_ASSISTANT_PROMPT, model, previousUserMessage.attachments, previousUserMessage.id);

    let accumulatedContent = "";
    let thinkingBuffer = "";
    const branchId = `regenerate-${assistantMessage.id ?? previousUserMessage.id}-${crypto.randomUUID()}`;
    responseContent = await streamChatCompletion({
      messages: messagesForAPI,
      model,
      signal: abortSignal,
      onChunk: (delta) => {
        accumulatedContent += delta;
        onMessagesUpdate((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessage.id
              ? { ...msg, content: accumulatedContent }
              : msg
          )
        );
      },
      conversationId,
      branchId,
      documentAttachmentIds: previousUserMessage.attachments?.flatMap((attachment) => attachment.id ? [attachment.id] : []),
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
        const resultPdf = extractPdfFromToolResult(toolResult.result);
        if (resultPdf) {
          const existing = messageMetadata?.pdfs ?? [];
          if (!existing.some((item) => item.url === resultPdf.url)) {
            messageMetadata = { ...messageMetadata, pdfs: [...existing, resultPdf] };
            onMessagesUpdate((prev) => prev.map((msg) =>
              msg.id === assistantMessage.id ? { ...msg, metadata: messageMetadata } : msg
            ));
          }
        }
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
        messageMetadata = extractMetadataFromProgress(progress, messageMetadata);
        onMessagesUpdate((prev) => prev.map((msg) =>
          msg.id === assistantMessage.id ? { ...msg, metadata: messageMetadata } : msg
        ));
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
          
        }
      },
      reasoningEffort,
      onThinking: (delta) => {
        thinkingBuffer += delta;
        onMessagesUpdate((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessage.id
              ? { ...msg, thinking: thinkingBuffer }
              : msg
          )
        );
      },
      onResponseIncomplete: () => {
        responseIncomplete = true;
      },
      onArtifact: (event) => {
        const eventWithMessage = { ...event, messageId: assistantMessage.id };
        artifactCollector.push(eventWithMessage);

        if (event.type === ArtifactEventType.END) {
          const artifacts = artifactCollector.getArtifacts();
          if (artifacts.length > 0) {
            messageMetadata = { ...(messageMetadata || {}), artifacts };
            onMessagesUpdate((prev) =>
              prev.map((msg) =>
                msg.id === assistantMessage.id
                  ? { ...msg, metadata: messageMetadata }
                  : msg
              )
            );
          }
        }

        context.onArtifact?.(eventWithMessage);
      },
    });
    onBranchIdUpdate?.(branchId);

    if (toolActivities.length > 0) {
      messageMetadata = { ...(messageMetadata || {}), toolActivities };
    }

    const artifacts = artifactCollector.getArtifacts();
    if (artifacts.length > 0) {
      messageMetadata = { ...(messageMetadata || {}), artifacts };
    }

    onMessagesUpdate((prev) =>
      prev.map((msg) =>
        msg.id === assistantMessage.id
          ? { ...msg, metadata: messageMetadata }
          : msg
      )
    );

    if (responseIncomplete) {
      messageMetadata = { ...messageMetadata, streamStatus: "incomplete" };
      onMessagesUpdate((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessage.id ? { ...msg, metadata: messageMetadata } : msg
        )
      );
    }

    const persistableAssistantContent = getPersistableAssistantContent(responseContent, messageMetadata);

    if (persistableAssistantContent && persistableAssistantContent !== responseContent) {
      onMessagesUpdate((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessage.id
            ? { ...msg, content: persistableAssistantContent }
            : msg
        )
      );
    }

    if (persistableAssistantContent && !abortSignal.aborted) {
      if (cacheQuery && responseContent && artifacts.length === 0 && !responseIncomplete) {
        saveToCacheMutate({
          query: cacheQuery,
          response: responseContent,
          model,
          reasoningEffort,
        });
      }

      if (conversationId && assistantMessage.id) {
        const updatedAssistant = await updateAssistantMessage(
          conversationId,
          assistantMessage.id,
          persistableAssistantContent,
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
        
        queryClient.invalidateQueries({ queryKey: queryKeys.conversation(conversationId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
      }

      persistConversationMemoryIfEligible({
        userMessageContent: previousUserMessage.content,
        assistantContent: persistableAssistantContent,
        userId: context.session?.user?.id,
        activeTool,
        userAttachments: previousUserMessage.attachments,
        memoryStatus: currentMemoryStatus,
        flow: "regenerate",
      });
    }

    return { success: true };
  } catch (err) {
    const errorName =
      err !== null && err !== undefined && typeof err === "object"
        ? (err as Record<string, unknown>).name
        : undefined;
    if (errorName === "AbortError") {
      onMessagesUpdate(() => originalMessagesState);
      return { success: false, error: "aborted" };
    }
    
    const errorMessage = toUserFriendlyError(err);
    toast.error(TOAST_ERROR_MESSAGES.CHAT.FAILED_SEND, {
      description: errorMessage,
    });
    
    if (responseContent || messageMetadata?.pdfs?.length || messageMetadata?.artifacts?.length) {
      messageMetadata = { ...messageMetadata, streamStatus: "error", streamError: errorMessage };
      onMessagesUpdate((prev) => prev.map((msg) =>
        msg.id === assistantMessage.id
          ? { ...msg, content: getPersistableAssistantContent(responseContent, messageMetadata) ?? responseContent, metadata: messageMetadata }
          : msg
      ));
    } else {
      onMessagesUpdate(() => originalMessagesState);
    }
    return { success: false, error: errorMessage };
  }
}
