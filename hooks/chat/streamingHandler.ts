import type { Message, ToolActivity, MessageMetadata } from "@/lib/schemas/chat";
import { ToolStatus, MessageRole } from "@/lib/schemas/chat";
import type { HumanInTheLoopRequestEvent, MemoryStatus } from "@/types/chat";
import { ArtifactEventType, type ArtifactEvent } from "@/types/artifact";
import type { QueryClient } from "@tanstack/react-query";
import { streamChatCompletion } from "./streamingApi";
import { performCacheCheck } from "./cacheHandler";
import { handleConversationSaving, buildMessagesForAPI, getPersistableAssistantContent } from "./conversationManager";
import { DEFAULT_ASSISTANT_PROMPT } from "@/lib/prompts";
import { HOOK_ERROR_MESSAGES } from "@/constants/errors";
import { persistConversationMemoryIfEligible } from "./memoryPersistence";
import { toJsonValue } from "@/lib/json";
import { createArtifactMetadataCollector } from "@/lib/artifacts/metadata";

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
  thinkingEnabled?: boolean;
  existingAssistantMessageId?: string;
}

interface StreamingCallbacks {
  onMessagesUpdate: (updater: (prev: Message[]) => Message[]) => void;
  saveToCacheMutate: (data: { query: string; response: string }) => void;
  onMemoryStatusUpdate?: (status: MemoryStatus) => void;
  onArtifact?: (event: ArtifactEvent) => void;
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

function toHumanInTheLoopMetadata(request: HumanInTheLoopRequestEvent): MessageMetadata["humanInTheLoopRequest"] {
  return toJsonValue(request) as MessageMetadata["humanInTheLoopRequest"];
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
    thinkingEnabled = false,
    existingAssistantMessageId,
  } = context;

  const { onMessagesUpdate, saveToCacheMutate, onMemoryStatusUpdate, onArtifact } = callbacks;
  let assistantMessageId = existingAssistantMessageId || `assistant-pending-${conversationId}`;
  let assistantContent = "";
  const toolActivities: ToolActivity[] = [];
  let currentMemoryStatus: MemoryStatus | undefined;
  let messageMetadata: MessageMetadata | undefined;
  let messageCreated = !!existingAssistantMessageId || messages.some((m) => m.id === assistantMessageId);
  let thinkingContent = "";
  let thinkingStartTime = 0;
  let humanInTheLoopPending = false;
  const artifactCollector = createArtifactMetadataCollector();

  const upsertAssistantMessage = (prev: Message[], msg: Message): Message[] => {
    const idx = prev.findIndex((m) => m.id === msg.id);
    if (idx !== -1) {
      const updated = [...prev];
      updated[idx] = msg;
      return updated;
    }
    return [...prev, msg];
  };

  const replaceAssistantMessageId = (savedAssistantMessageId: string, metadata?: MessageMetadata) => {
    if (!savedAssistantMessageId) return;

    const previousAssistantMessageId = assistantMessageId;
    assistantMessageId = savedAssistantMessageId;
    updateAssistantMessage(onMessagesUpdate, previousAssistantMessageId, {
      id: savedAssistantMessageId,
      ...(metadata && { metadata }),
      });
  };

  const ensureAssistantMessage = (content = "") => {
    if (messageCreated) return;

    messageCreated = true;
    onMessagesUpdate((prev) => upsertAssistantMessage(prev, {
      role: MessageRole.ASSISTANT,
      content,
      id: assistantMessageId,
      timestamp: Date.now(),
      model,
      toolActivities: [...toolActivities],
      metadata: messageMetadata,
    }));
  };

  const applyArtifactMetadata = (): MessageMetadata | undefined => {
    const artifacts = artifactCollector.getArtifacts();
    if (artifacts.length === 0) return messageMetadata;

    messageMetadata = {
      ...messageMetadata,
      artifacts,
    };
    return messageMetadata;
  };

  try {
    const { cacheQuery, cacheData } = await performCacheCheck({
      messages,
      content: userMessageContent,
      attachments: userAttachments,
      abortSignal,
      activeTool,
    });

    if (cacheData.cached && cacheData.response !== undefined && typeof cacheData.response === 'string') {
      assistantContent = cacheData.response;
      
      if (existingAssistantMessageId) {
        updateAssistantMessage(onMessagesUpdate, assistantMessageId, {
          content: assistantContent,
        });
      } else {
        onMessagesUpdate((prev) => upsertAssistantMessage(prev, {
            role: MessageRole.ASSISTANT,
            content: assistantContent,
            id: assistantMessageId,
            timestamp: Date.now(),
            model,
            toolActivities: [],
        }));
      }
      handleConversationSaving(
        false,
        conversationId,
        userMessageContent,
        assistantContent,
        userTimestamp,
        queryClient,
        (data) => {
          replaceAssistantMessageId(data.assistantMessageId);
        },
        undefined,
        false,
        undefined,
        undefined
      ).catch((err) => {
        console.error("[streamingHandler] Background assistant message save (cache) failed:", err);
      });

      persistConversationMemoryIfEligible({
        userMessageContent,
        assistantContent,
        userId: session?.user?.id,
        memoryEnabled,
        activeTool,
        userAttachments,
        flow: "send",
      });

      return { success: true, assistantMessageId };
    }

    const messagesForAPI = buildMessagesForAPI(messages, userMessageContent, DEFAULT_ASSISTANT_PROMPT, model, userAttachments);

    const responseContent = await streamChatCompletion({
      messages: messagesForAPI,
      model,
      signal: abortSignal,
      onChunk: (fullContent) => {
        if (!messageCreated) {
          messageCreated = true;
          onMessagesUpdate((prev) => upsertAssistantMessage(prev, {
              role: MessageRole.ASSISTANT,
              content: fullContent,
              id: assistantMessageId,
              timestamp: Date.now(),
              model,
              toolActivities: [],
              metadata: messageMetadata,
          }));
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
          onMessagesUpdate((prev) => upsertAssistantMessage(prev, {
              role: MessageRole.ASSISTANT,
              content: "",
              id: assistantMessageId,
              timestamp: Date.now(),
              model,
              toolActivities: [],
              metadata: messageMetadata,
          }));
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
          onMessagesUpdate((prev) => upsertAssistantMessage(prev, {
              role: MessageRole.ASSISTANT,
              content: "",
              id: assistantMessageId,
              timestamp: Date.now(),
              model,
              toolActivities: [...toolActivities],
              metadata: messageMetadata,
          }));
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
            result: toJsonValue(toolResult.result),
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
              toolName: progress.toolName,
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
      memoryEnabled,
      thinkingEnabled,
      onHumanInTheLoopRequest: (request) => {
        humanInTheLoopPending = true;
        messageMetadata = {
          ...messageMetadata,
          humanInTheLoopRequest: toHumanInTheLoopMetadata(request),
          humanInTheLoopStatus: "pending",
        };

        if (!messageCreated) {
          messageCreated = true;
          onMessagesUpdate((prev) => upsertAssistantMessage(prev, {
              role: MessageRole.ASSISTANT,
              content: "",
              id: assistantMessageId,
              timestamp: Date.now(),
              model,
              toolActivities: [...toolActivities],
              metadata: messageMetadata,
          }));
        } else {
          updateAssistantMessage(onMessagesUpdate, assistantMessageId, {
            metadata: messageMetadata,
          });
        }
      },
      onThinking: (thinking) => {
        if (!thinkingStartTime) thinkingStartTime = Date.now();
        thinkingContent = thinking;
        if (!messageCreated) {
          messageCreated = true;
          onMessagesUpdate((prev) => upsertAssistantMessage(prev, {
              role: MessageRole.ASSISTANT,
              content: "",
              thinking,
              id: assistantMessageId,
              timestamp: Date.now(),
              model,
              toolActivities: [],
              metadata: messageMetadata,
          }));
        } else {
          updateAssistantMessage(onMessagesUpdate, assistantMessageId, {
            thinking,
          });
        }
      },
      onArtifact: (event) => {
        const eventWithMessage = { ...event, messageId: assistantMessageId };
        artifactCollector.push(eventWithMessage);

        if (event.type === ArtifactEventType.START) {
          ensureAssistantMessage();
        }

        if (event.type === ArtifactEventType.END) {
          const nextMetadata = applyArtifactMetadata();
          if (nextMetadata) {
            ensureAssistantMessage();
            updateAssistantMessage(onMessagesUpdate, assistantMessageId, {
              metadata: nextMetadata,
            });
          }
        }
        onArtifact?.(eventWithMessage);
      },
    });

    assistantContent = responseContent;
    const artifacts = artifactCollector.getArtifacts();

    if (thinkingContent) {
      const thinkingDurationMs = thinkingStartTime ? Date.now() - thinkingStartTime : undefined;
      messageMetadata = { ...messageMetadata, thinking: thinkingContent, thinkingDurationMs };
    }

    if (toolActivities.length > 0) {
      messageMetadata = { ...messageMetadata, toolActivities };
    }

    if (artifacts.length > 0) {
      messageMetadata = { ...messageMetadata, artifacts };
    }

    if (messageMetadata) {
      updateAssistantMessage(onMessagesUpdate, assistantMessageId, {
        metadata: messageMetadata,
      });
    }

    const persistableAssistantContent = getPersistableAssistantContent(assistantContent, messageMetadata);

    if (persistableAssistantContent && persistableAssistantContent !== assistantContent) {
      updateAssistantMessage(onMessagesUpdate, assistantMessageId, {
        content: persistableAssistantContent,
      });
    }

    if (persistableAssistantContent && !abortSignal.aborted) {
      if (cacheQuery && assistantContent && artifacts.length === 0) {
        saveToCacheMutate({
          query: cacheQuery,
          response: assistantContent,
        });
      }

      const savePromise = handleConversationSaving(
        false,
        conversationId,
        userMessageContent,
        assistantContent,
        userTimestamp,
        queryClient,
        (data) => {
          replaceAssistantMessageId(data.assistantMessageId, messageMetadata);
        },
        undefined,
        false,
        undefined,
        messageMetadata
      );

      if (humanInTheLoopPending) {
        await savePromise;
      } else {
        savePromise.catch((err) => {
          console.error("[streamingHandler] Background assistant message save failed:", err);
        });

        persistConversationMemoryIfEligible({
          userMessageContent,
          assistantContent: persistableAssistantContent,
          userId: session?.user?.id,
          memoryEnabled,
          activeTool,
          userAttachments,
          memoryStatus: currentMemoryStatus,
          flow: "send",
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
