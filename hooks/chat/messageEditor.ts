import { type Attachment, type ToolActivity, type MessageMetadata, ToolStatus, MessageRole, type Message } from "@/lib/schemas/chat";
import { toast } from "sonner";
import { buildMultimodalContent } from "@/lib/contentUtils";
import { getModel } from "@/lib/storage";
import { DEFAULT_ASSISTANT_PROMPT } from "@/lib/prompts";
import { TOAST_ERROR_MESSAGES } from "@/constants/errors";
import { finalizeEditedMessage } from "./messageApi";
import { streamChatCompletion } from "./streamingApi";
import { buildCacheQuery, shouldUseSemanticCache } from "./cacheHandler";
import { buildMessagesForAPI, getPersistableAssistantContent } from "./conversationManager";
import { createNewVersion, buildUpdatedVersionsList, fetchMessageVersions, updateMessageWithVersions } from "./versionManager";
import type { MemoryStatus } from "@/types/chat";
import type { EditMessageContext } from "@/types/chatHooks";
import { persistConversationMemoryIfEligible } from "./memoryPersistence";
import { logger } from "@/lib/logger";
import { toUserFriendlyError } from "@/lib/errorMessages";
import { queryKeys } from "@/lib/queryKeys";
import { toJsonValue } from "@/lib/json";
import { ArtifactEventType } from "@/types/artifact";
import { createArtifactMetadataCollector } from "@/lib/artifacts/metadata";
import { getPendingAssistantMessageId, isPendingAssistantId } from "./pendingAssistant";

export async function handleEditMessage(
  messageId: string,
  newContent: string,
  attachments: Attachment[] | undefined,
  context: EditMessageContext,
  activeTool?: string | null,
  memoryEnabled?: boolean,
  thinkingEnabled?: boolean
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
  const placeholderAssistantId = getPendingAssistantMessageId(conversationId ?? messageId);
  const messagesUpToEdit = messages.slice(0, messageIndex);
  const originalMessagesState = [...messages];
  const toolActivities: ToolActivity[] = [];
  let currentMemoryStatus: MemoryStatus | undefined;
  let messageMetadata: MessageMetadata = {};
  const artifactCollector = createArtifactMetadataCollector();
  
  const nextAssistantIndex = messages.findIndex((m, idx) => idx > messageIndex && m.role === MessageRole.ASSISTANT);
  const nextAssistantMessage = nextAssistantIndex !== -1 ? messages[nextAssistantIndex] : undefined;
  const persistedNextAssistantId =
    nextAssistantMessage?.id && !isPendingAssistantId(nextAssistantMessage.id)
      ? nextAssistantMessage.id
      : undefined;
  const messagesAfterAssistant = nextAssistantIndex !== -1 ? messages.slice(nextAssistantIndex + 1) : [];
  
  const newEditedVersion = createNewVersion(
    messageToEdit.versions || [],
    MessageRole.USER,
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
      role: MessageRole.ASSISTANT,
      content: "",
      id: placeholderAssistantId,
      timestamp: Date.now(),
      model: model,
      toolActivities: [],
    },
    ...messagesAfterAssistant,
  ]);

  try {
    if (!messageToEdit.id) {
      throw new Error("Message is missing an id");
    }

    const useCaching = shouldUseSemanticCache(
      messagesUpToEdit,
      attachments,
      activeTool
    );
    const cacheQuery = useCaching ? buildCacheQuery(messagesUpToEdit, messageContent) : '';
    const messagesForAPI = buildMessagesForAPI(messagesUpToEdit, messageContent, DEFAULT_ASSISTANT_PROMPT, model, attachments);

    let accumulatedContent = "";
    let thinkingBuffer = "";
    const responseContent = await streamChatCompletion({
      messages: messagesForAPI,
      model,
      signal: abortSignal,
      onChunk: (delta) => {
        accumulatedContent += delta;
        onMessagesUpdate((prev) =>
          prev.map((msg) =>
            msg.id === placeholderAssistantId
              ? { ...msg, content: accumulatedContent }
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
            msg.id === placeholderAssistantId
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
              msg.id === placeholderAssistantId
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
      memoryEnabled: memoryEnabled ?? true,
      thinkingEnabled,
      onThinking: (delta) => {
        thinkingBuffer += delta;
        onMessagesUpdate((prev) =>
          prev.map((msg) =>
            msg.id === placeholderAssistantId
              ? { ...msg, thinking: thinkingBuffer }
              : msg
          )
        );
      },
      onArtifact: (event) => {
        const eventWithMessage = { ...event, messageId: placeholderAssistantId };
        artifactCollector.push(eventWithMessage);

        if (event.type === ArtifactEventType.END) {
          const artifacts = artifactCollector.getArtifacts();
          if (artifacts.length > 0) {
            messageMetadata = { ...messageMetadata, artifacts };
            onMessagesUpdate((prev) =>
              prev.map((msg) =>
                msg.id === placeholderAssistantId
                  ? { ...msg, metadata: messageMetadata }
                  : msg
              )
            );
          }
        }

        context.onArtifact?.(eventWithMessage);
      },
    });

    if (toolActivities.length > 0) {
      messageMetadata = { ...messageMetadata, toolActivities };
    }

    const artifacts = artifactCollector.getArtifacts();
    if (artifacts.length > 0) {
      messageMetadata = { ...messageMetadata, artifacts };
    }

    onMessagesUpdate((prev) =>
      prev.map((msg) =>
        msg.id === placeholderAssistantId
          ? { ...msg, metadata: messageMetadata }
          : msg
      )
    );

    const persistableAssistantContent = getPersistableAssistantContent(responseContent, messageMetadata);

    if (persistableAssistantContent && persistableAssistantContent !== responseContent) {
      onMessagesUpdate((prev) =>
        prev.map((msg) =>
          msg.id === placeholderAssistantId
            ? { ...msg, content: persistableAssistantContent }
            : msg
        )
      );
    }

    if (persistableAssistantContent && !abortSignal.aborted) {
      if (cacheQuery && responseContent && artifacts.length === 0) {
        saveToCacheMutate({
          query: cacheQuery,
          response: responseContent,
        });
      }

      if (conversationId) {
        const conversationIdStr = conversationId;
        const finalizedEdit = await finalizeEditedMessage(
          conversationIdStr,
          messageToEdit.id,
          messageContent,
          persistableAssistantContent,
          persistedNextAssistantId,
          attachments,
          messageMetadata,
          abortSignal
        );
        const updatedMessageId = finalizedEdit.updatedMessage.id;
        const parentId = finalizedEdit.updatedMessage.parentMessageId || updatedMessageId;
        const versions = await fetchMessageVersions(conversationIdStr, parentId);
        const assistantParentId =
          finalizedEdit.assistantMessage.parentMessageId || finalizedEdit.assistantMessage.id;
        let assistantVersions: Message[] = [];
        let shouldUseAssistantFallback = false;

        try {
          assistantVersions = await fetchMessageVersions(
            conversationIdStr,
            assistantParentId,
            { throwOnError: true }
          );

          if (assistantVersions.length === 0) {
            shouldUseAssistantFallback = true;
            logger.warn("Falling back to finalized assistant edit data after empty versions response", {
              conversationId: conversationIdStr,
              assistantParentId,
              assistantMessageId: finalizedEdit.assistantMessage.id,
            });
            queryClient.invalidateQueries({ queryKey: queryKeys.conversation(conversationIdStr) });
          }
        } catch (assistantVersionsError) {
          shouldUseAssistantFallback = true;
          logger.warn("Failed to fetch assistant message versions after edit; using finalized response fallback", {
            conversationId: conversationIdStr,
            assistantParentId,
            assistantMessageId: finalizedEdit.assistantMessage.id,
            error: assistantVersionsError instanceof Error
              ? assistantVersionsError.message
              : String(assistantVersionsError),
          });
          queryClient.invalidateQueries({ queryKey: queryKeys.conversation(conversationIdStr) });
        }

        onMessagesUpdate((prev) =>
          prev.map((msg) => {
            if (msg.id === messageToEdit.id || msg.id === updatedMessageId) {
              return updateMessageWithVersions(msg, updatedMessageId, versions);
            }
            if (msg.id === placeholderAssistantId) {
              if (shouldUseAssistantFallback) {
                return {
                  ...msg,
                  id: finalizedEdit.assistantMessage.id,
                  content: finalizedEdit.assistantMessage.content,
                  timestamp: new Date(finalizedEdit.assistantMessage.createdAt).getTime(),
                  parentMessageId: finalizedEdit.assistantMessage.parentMessageId,
                  siblingIndex: finalizedEdit.assistantMessage.siblingIndex,
                  attachments: finalizedEdit.assistantMessage.attachments,
                  metadata: messageMetadata,
                };
              }

              return updateMessageWithVersions(
                {
                  ...msg,
                  metadata: messageMetadata,
                },
                finalizedEdit.assistantMessage.id,
                assistantVersions
              );
            }
            return msg;
          })
        );
        
        queryClient.invalidateQueries({ queryKey: queryKeys.conversation(conversationIdStr) });
        queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
      }

      const assistantContentForMemory = prepareAssistantContentForMemory(persistableAssistantContent);
      persistConversationMemoryIfEligible({
        userMessageContent: messageContent,
        assistantContent: assistantContentForMemory,
        userId: context.session?.user?.id,
        memoryEnabled: memoryEnabled ?? true,
        activeTool,
        userAttachments: attachments,
        memoryStatus: currentMemoryStatus,
        flow: "edit",
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
    
    onMessagesUpdate(() => originalMessagesState);
    return { success: false, error: errorMessage };
  }
}

function prepareAssistantContentForMemory(content: string): string {
  if (!content) return content;

  let stripped = content;

  stripped = stripped.replace(/<artifact(\s[^>]*)?>[\s\S]*?<\/artifact>/g, "");

  stripped = stripped.replace(/^ {0,3}```[\s\S]*?^ {0,3}```/gm, (match) => {
    if (match.length > 500) {
      const lang = match.match(/```(\w*)/)?.[1] || "";
      const lines = match.split('\n').length - 2;
      return `\`\`\`${lang}\n[${lines} lines omitted]\n\`\`\``;
    }
    return match;
  });

  stripped = stripped.replace(/<[^>]+>/g, "");

  stripped = stripped.replace(/\n{3,}/g, "\n\n");

  if (stripped.length > 2000) {
    stripped = stripped.slice(0, 2000) + "...";
  }

  return stripped.trim();
}
