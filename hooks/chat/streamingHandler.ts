import type {
  Message,
  ToolActivity,
  MessageMetadata,
} from "@/lib/schemas/chat";
import type { ReasoningEffortLevel } from "@/constants/openai-models";
import { ToolStatus, MessageRole } from "@/lib/schemas/chat";
import type { HumanInTheLoopRequestEvent, MemoryStatus } from "@/types/chat";
import { ArtifactEventType, type ArtifactEvent } from "@/types/artifact";
import type { QueryClient } from "@tanstack/react-query";
import { streamChatCompletion } from "./streamingApi";
import { performCacheCheck } from "./cacheHandler";
import {
  handleConversationSaving,
  buildMessagesForAPI,
  getPersistableAssistantContent,
} from "./conversationManager";
import { saveAssistantMessage } from "./messageApi";
import { logger } from "@/lib/logger";
import { DEFAULT_ASSISTANT_PROMPT } from "@/lib/prompts";
import { HOOK_ERROR_MESSAGES } from "@/constants/errors";
import { persistConversationMemoryIfEligible } from "./memoryPersistence";
import { toJsonValue } from "@/lib/json";
import { createArtifactMetadataCollector } from "@/lib/artifacts/metadata";
import {
  getPendingAssistantMessageId,
  replaceMessageId,
  updateMessageById,
  upsertMessageById,
} from "./pendingAssistant";

interface StreamingContext {
  messages: Message[];
  conversationId: string;
  userMessageContent: string | Message["content"];
  userTimestamp: number;
  userMessageId?: string;
  userAttachments?: Message["attachments"];
  model: string;
  abortSignal: AbortSignal;
  queryClient: QueryClient;
  session?: { user: { id: string } };
  activeTool?: string | null;
  reasoningEffort?: ReasoningEffortLevel;
  existingAssistantMessageId?: string;
  branchId?: string;
}

interface StreamingCallbacks {
  onMessagesUpdate: (updater: (prev: Message[]) => Message[]) => void;
  saveToCacheMutate: (data: {
    query: string;
    response: string;
    model: string;
    reasoningEffort?: ReasoningEffortLevel | null;
  }) => void;
  onMemoryStatusUpdate?: (status: MemoryStatus) => void;
  onArtifact?: (event: ArtifactEvent) => void;
}

interface StreamingResult {
  success: boolean;
  error?: string;
  assistantMessageId?: string;
}

export function extractMetadataFromProgress(
  progress: { details?: Record<string, unknown> },
  currentMetadata?: MessageMetadata,
): MessageMetadata | undefined {
  if (!progress.details) return currentMetadata;

  let metadata = currentMetadata || {};

  if (
    "sources" in progress.details &&
    Array.isArray(progress.details.sources)
  ) {
    const details = progress.details as {
      sources?: MessageMetadata["sources"];
    };
    if (details.sources && details.sources.length > 0) {
      // Union by URL: several searches can run in one turn and a later event
      // must not drop earlier batches.
      const seenUrls = new Set(
        (currentMetadata?.sources ?? []).map((source) => source.url),
      );
      const mergedSources = [...(currentMetadata?.sources ?? [])];
      for (const source of details.sources) {
        if (!source.url || seenUrls.has(source.url)) continue;
        seenUrls.add(source.url);
        mergedSources.push(source);
      }
      if (mergedSources.length > 0) {
        metadata = { ...metadata, sources: mergedSources };
      }
    }
  }

  if ("images" in progress.details && Array.isArray(progress.details.images)) {
    const details = progress.details as { images?: MessageMetadata["images"] };
    if (details.images && details.images.length > 0) {
      metadata = { ...metadata, images: details.images };
    }
  }

  if ("pdf" in progress.details) {
    const raw = progress.details.pdf;
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      const record = raw as Record<string, unknown>;
      if (typeof record.url === "string" && typeof record.name === "string") {
        const pdf: NonNullable<MessageMetadata["pdfs"]>[number] = {
          url: record.url,
          name: record.name,
          ...(typeof record.title === "string" ? { title: record.title } : {}),
          ...(typeof record.size === "number" ? { size: record.size } : {}),
          ...(typeof record.pageCount === "number"
            ? { pageCount: record.pageCount }
            : {}),
        };
        const existing = currentMetadata?.pdfs ?? [];
        if (!existing.some((item) => item.url === pdf.url)) {
          metadata = { ...metadata, pdfs: [...existing, pdf] };
        }
      }
    }
  }

  const details = progress.details as {
    citations?: MessageMetadata["citations"];
    followUpQuestions?: string[];
  };

  if ("citations" in details && details.citations) {
    metadata = { ...metadata, citations: details.citations };
  }

  if ("followUpQuestions" in details && details.followUpQuestions) {
    metadata = { ...metadata, followUpQuestions: details.followUpQuestions };
  }

  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

export function extractPdfFromToolResult(
  result: unknown,
): NonNullable<MessageMetadata["pdfs"]>[number] | undefined {
  if (!result || typeof result !== "object" || Array.isArray(result))
    return undefined;
  const raw = (result as Record<string, unknown>).pdf;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const record = raw as Record<string, unknown>;
  if (typeof record.url !== "string" || typeof record.name !== "string")
    return undefined;
  return {
    url: record.url,
    name: record.name,
    ...(typeof record.title === "string" ? { title: record.title } : {}),
    ...(typeof record.size === "number" ? { size: record.size } : {}),
    ...(typeof record.pageCount === "number"
      ? { pageCount: record.pageCount }
      : {}),
  };
}

function toHumanInTheLoopMetadata(
  request: HumanInTheLoopRequestEvent,
): MessageMetadata["humanInTheLoopRequest"] {
  return toJsonValue(request) as MessageMetadata["humanInTheLoopRequest"];
}

function updateAssistantMessage(
  onMessagesUpdate: (updater: (prev: Message[]) => Message[]) => void,
  assistantMessageId: string,
  updates: Partial<Message>,
): void {
  onMessagesUpdate((prev) =>
    updateMessageById(prev, assistantMessageId, updates),
  );
}

export async function handleStreamingResponse(
  context: StreamingContext,
  callbacks: StreamingCallbacks,
): Promise<StreamingResult> {
  const {
    messages,
    conversationId,
    userMessageContent,
    userTimestamp,
    userMessageId,
    userAttachments,
    model,
    abortSignal,
    queryClient,
    session,
    activeTool,
    reasoningEffort,
    existingAssistantMessageId,
    branchId,
  } = context;

  const {
    onMessagesUpdate,
    saveToCacheMutate,
    onMemoryStatusUpdate,
    onArtifact,
  } = callbacks;
  let assistantMessageId =
    existingAssistantMessageId || getPendingAssistantMessageId(conversationId);
  let assistantContent = "";
  const toolActivities: ToolActivity[] = [];
  let currentMemoryStatus: MemoryStatus | undefined;
  let messageMetadata: MessageMetadata | undefined;
  let messageCreated =
    !!existingAssistantMessageId ||
    messages.some((m) => m.id === assistantMessageId);
  let thinkingContent = "";
  let thinkingStartTime = 0;
  let humanInTheLoopPending = false;
  let responseIncompleteReason: "length" | undefined;
  const artifactCollector = createArtifactMetadataCollector();

  const replaceAssistantMessageId = (
    savedAssistantMessageId: string,
    metadata?: MessageMetadata,
  ) => {
    if (!savedAssistantMessageId) return;

    const previousAssistantMessageId = assistantMessageId;
    assistantMessageId = savedAssistantMessageId;
    onMessagesUpdate((prev) =>
      replaceMessageId(
        prev,
        previousAssistantMessageId,
        savedAssistantMessageId,
        {
          id: savedAssistantMessageId,
          ...(metadata && { metadata }),
        },
      ),
    );
  };

  const ensureAssistantMessage = (content = "") => {
    if (messageCreated) return;

    messageCreated = true;
    onMessagesUpdate((prev) =>
      upsertMessageById(prev, {
        role: MessageRole.ASSISTANT,
        content,
        id: assistantMessageId,
        timestamp: Date.now(),
        model,
        toolActivities: [...toolActivities],
        metadata: messageMetadata,
      }),
    );
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
      model,
      reasoningEffort,
    });

    if (
      cacheData.cached &&
      cacheData.response !== undefined &&
      typeof cacheData.response === "string"
    ) {
      assistantContent = cacheData.response;

      if (existingAssistantMessageId) {
        updateAssistantMessage(onMessagesUpdate, assistantMessageId, {
          content: assistantContent,
        });
      } else {
        onMessagesUpdate((prev) =>
          upsertMessageById(prev, {
            role: MessageRole.ASSISTANT,
            content: assistantContent,
            id: assistantMessageId,
            timestamp: Date.now(),
            model,
            toolActivities: [],
          }),
        );
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
        undefined,
      ).catch((err) => {
        console.error(
          "[streamingHandler] Background assistant message save (cache) failed:",
          err,
        );
      });

      persistConversationMemoryIfEligible({
        userMessageContent,
        assistantContent,
        userId: session?.user?.id,
        activeTool,
        userAttachments,
        flow: "send",
      });

      return { success: true, assistantMessageId };
    }

    const messagesForAPI = buildMessagesForAPI(
      messages,
      userMessageContent,
      DEFAULT_ASSISTANT_PROMPT,
      model,
      userAttachments,
      userMessageId,
    );

    const responseContent = await streamChatCompletion({
      messages: messagesForAPI,
      model,
      signal: abortSignal,
      onChunk: (delta) => {
        assistantContent += delta;
        if (!messageCreated) {
          messageCreated = true;
          onMessagesUpdate((prev) =>
            upsertMessageById(prev, {
              role: MessageRole.ASSISTANT,
              content: assistantContent,
              id: assistantMessageId,
              timestamp: Date.now(),
              model,
              toolActivities: [],
              metadata: messageMetadata,
            }),
          );
        } else {
          updateAssistantMessage(onMessagesUpdate, assistantMessageId, {
            content: assistantContent,
          });
        }
      },
      conversationId,
      branchId,
      onMemoryStatus: (status) => {
        currentMemoryStatus = status;
        onMemoryStatusUpdate?.(status);
        if (!messageCreated) {
          messageCreated = true;
          onMessagesUpdate((prev) =>
            upsertMessageById(prev, {
              role: MessageRole.ASSISTANT,
              content: "",
              id: assistantMessageId,
              timestamp: Date.now(),
              model,
              toolActivities: [],
              metadata: messageMetadata,
            }),
          );
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
          onMessagesUpdate((prev) =>
            upsertMessageById(prev, {
              role: MessageRole.ASSISTANT,
              content: "",
              id: assistantMessageId,
              timestamp: Date.now(),
              model,
              toolActivities: [...toolActivities],
              metadata: messageMetadata,
            }),
          );
        } else {
          updateAssistantMessage(onMessagesUpdate, assistantMessageId, {
            toolActivities: [...toolActivities],
          });
        }
      },
      onToolResult: (toolResult) => {
        const resultPdf = extractPdfFromToolResult(toolResult.result);
        if (resultPdf) {
          const existing = messageMetadata?.pdfs ?? [];
          if (!existing.some((item) => item.url === resultPdf.url)) {
            messageMetadata = {
              ...messageMetadata,
              pdfs: [...existing, resultPdf],
            };
            ensureAssistantMessage();
            updateAssistantMessage(onMessagesUpdate, assistantMessageId, {
              metadata: messageMetadata,
            });
          }
        }
        const activityIndex = toolActivities.findIndex(
          (a) => a.toolCallId === toolResult.toolCallId,
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
        messageMetadata = extractMetadataFromProgress(
          progress,
          messageMetadata,
        );
        if (messageCreated && messageMetadata) {
          updateAssistantMessage(onMessagesUpdate, assistantMessageId, {
            metadata: messageMetadata,
          });
        }
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
        }
      },
      reasoningEffort,
      onHumanInTheLoopRequest: (request) => {
        humanInTheLoopPending = true;
        messageMetadata = {
          ...messageMetadata,
          humanInTheLoopRequest: toHumanInTheLoopMetadata(request),
          humanInTheLoopStatus: "pending",
        };

        if (!messageCreated) {
          messageCreated = true;
          onMessagesUpdate((prev) =>
            upsertMessageById(prev, {
              role: MessageRole.ASSISTANT,
              content: "",
              id: assistantMessageId,
              timestamp: Date.now(),
              model,
              toolActivities: [...toolActivities],
              metadata: messageMetadata,
            }),
          );
        } else {
          updateAssistantMessage(onMessagesUpdate, assistantMessageId, {
            metadata: messageMetadata,
          });
        }
      },
      onThinking: (delta) => {
        if (!thinkingStartTime) thinkingStartTime = Date.now();
        thinkingContent += delta;
        if (!messageCreated) {
          messageCreated = true;
          onMessagesUpdate((prev) =>
            upsertMessageById(prev, {
              role: MessageRole.ASSISTANT,
              content: "",
              thinking: thinkingContent,
              id: assistantMessageId,
              timestamp: Date.now(),
              model,
              toolActivities: [],
              metadata: messageMetadata,
            }),
          );
        } else {
          updateAssistantMessage(onMessagesUpdate, assistantMessageId, {
            thinking: thinkingContent,
          });
        }
      },
      onResponseIncomplete: (reason) => {
        responseIncompleteReason = reason;
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
      const thinkingDurationMs = thinkingStartTime
        ? Date.now() - thinkingStartTime
        : undefined;
      messageMetadata = {
        ...messageMetadata,
        thinking: thinkingContent,
        thinkingDurationMs,
      };
    }

    if (toolActivities.length > 0) {
      messageMetadata = { ...messageMetadata, toolActivities };
    }

    if (responseIncompleteReason === "length") {
      messageMetadata = { ...messageMetadata, streamStatus: "incomplete" };
    }

    if (artifacts.length > 0) {
      messageMetadata = { ...messageMetadata, artifacts };
    }

    if (messageMetadata) {
      updateAssistantMessage(onMessagesUpdate, assistantMessageId, {
        metadata: messageMetadata,
      });
    }

    const persistableAssistantContent = getPersistableAssistantContent(
      assistantContent,
      messageMetadata,
    );

    if (
      persistableAssistantContent &&
      persistableAssistantContent !== assistantContent
    ) {
      updateAssistantMessage(onMessagesUpdate, assistantMessageId, {
        content: persistableAssistantContent,
      });
    }

    if (persistableAssistantContent && !abortSignal.aborted) {
      if (
        cacheQuery &&
        assistantContent &&
        artifacts.length === 0 &&
        !messageMetadata?.pdfs?.length &&
        !responseIncompleteReason
      ) {
        saveToCacheMutate({
          query: cacheQuery,
          response: assistantContent,
          model,
          reasoningEffort,
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
        messageMetadata,
      );

      if (humanInTheLoopPending) {
        await savePromise;
      } else {
        savePromise.catch((err) => {
          console.error(
            "[streamingHandler] Background assistant message save failed:",
            err,
          );
        });

        persistConversationMemoryIfEligible({
          userMessageContent,
          assistantContent: persistableAssistantContent,
          userId: session?.user?.id,
          activeTool,
          userAttachments,
          memoryStatus: currentMemoryStatus,
          flow: "send",
        });
      }
    }

    return { success: true, assistantMessageId };
  } catch (err) {
    const errorName =
      err !== null && err !== undefined && typeof err === "object"
        ? (err as Record<string, unknown>).name
        : undefined;
    if (errorName === "AbortError") {
      if (messageCreated) {
        onMessagesUpdate((prev) =>
          prev.filter((msg) => msg.id !== assistantMessageId),
        );
      }
      return { success: false, error: "aborted" };
    }

    let errorMessage: string;
    try {
      errorMessage =
        err instanceof Error
          ? err.message
          : HOOK_ERROR_MESSAGES.UNKNOWN_ERROR_OCCURRED;
    } catch {
      errorMessage = HOOK_ERROR_MESSAGES.UNKNOWN_ERROR_OCCURRED;
    }
    const partialMetadata: MessageMetadata = {
      ...messageMetadata,
      ...(thinkingContent.trim() ? { thinking: thinkingContent } : {}),
      ...(toolActivities.length > 0 ? { toolActivities } : {}),
    };
    const partialContent = getPersistableAssistantContent(
      assistantContent,
      partialMetadata,
    );
    if (messageCreated && partialContent !== null) {
      messageMetadata = {
        ...partialMetadata,
        streamStatus: "error",
        streamError: errorMessage,
      };
      updateAssistantMessage(onMessagesUpdate, assistantMessageId, {
        content: partialContent,
        metadata: messageMetadata,
      });
      if (conversationId && !abortSignal.aborted) {
        void saveAssistantMessage(
          conversationId,
          partialContent,
          messageMetadata,
        ).catch((saveError) => {
          logger.warn(
            "[streamingHandler] Failed to preserve partial response:",
            saveError,
          );
        });
      }
    } else if (messageCreated) {
      onMessagesUpdate((prev) =>
        prev.filter((msg) => msg.id !== assistantMessageId),
      );
    }
    return { success: false, error: errorMessage };
  }
}
