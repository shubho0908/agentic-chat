import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { type Message, type MessageMetadata, type ToolActivity, ToolStatus, MessageRole } from "@/lib/schemas/chat";
import { useSaveToCache } from "./useSemanticCache";
import { TOAST_SUCCESS_MESSAGES } from "@/constants/toasts";
import type {
  UseChatOptions,
  UseChatReturn,
  MemoryStatus,
  SendMessageOptions,
  EditMessageOptions,
  RegenerateMessageOptions,
  ContinueConversationOptions,
} from "@/types/chat";
import { handleSendMessage, continueIncompleteConversation } from "./chat/messageSender";
import { handleEditMessage } from "./chat/messageEditor";
import { handleRegenerateResponse } from "./chat/messageRegenerator";
import { useStreaming } from "@/contexts/streaming-context";
import { getModel } from "@/lib/storage";
import { streamChatApproval } from "./chat/streamingApi";
import { HUMAN_IN_THE_LOOP_PENDING_ASSISTANT_CONTENT, getPersistableAssistantContent } from "./chat/conversationManager";
import { saveAssistantMessage, updateAssistantMessage as updateSavedAssistantMessage } from "./chat/messageApi";
import { queryKeys } from "@/lib/queryKeys";
import { toUserFriendlyError } from "@/lib/errorMessages";
import { toJsonValue } from "@/lib/json";
import { ArtifactEventType } from "@/types/artifact";
import { createArtifactMetadataCollector } from "@/lib/artifacts/metadata";
import {
  dedupeMessagesById,
  isPendingAssistantId,
  replaceMessageId,
  updateMessageById,
} from "./chat/pendingAssistant";

function isAbortError(error: unknown): boolean {
  return (
    error instanceof DOMException && error.name === "AbortError"
  ) || (
    error instanceof Error && error.name === "AbortError"
  );
}

export function useChat(options: UseChatOptions = {}): UseChatReturn {
  const { initialMessages = [], conversationId: initialConversationId, autoContinue, onArtifact } = options;
  const [messages, setMessages] = useState<Message[]>(() => dedupeMessagesById(initialMessages));
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(initialConversationId || null);
  const [memoryStatus, setMemoryStatus] = useState<MemoryStatus | undefined>();
  const abortControllerRef = useRef<AbortController | null>(null);
  const saveToCache = useSaveToCache();
  const router = useRouter();
  const queryClient = useQueryClient();
  const prevConversationIdRef = useRef<string | null>(initialConversationId || null);
  const autoContinuedRef = useRef<string | null>(null);
  const { startStreaming, stopStreaming: stopStreamingContext, updateStreamingConversationId } = useStreaming();

  const messagesRef = useRef<Message[]>(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    const currentId = initialConversationId || null;
    const prevId = prevConversationIdRef.current;
    const isNavigatingToExistingConversation = currentId !== null && prevId !== currentId && initialMessages.length > 0;
    const messagesJustLoaded = messages.length === 0 && initialMessages.length > 0 && currentId !== null;
    if (isNavigatingToExistingConversation || messagesJustLoaded) {
      setMessages(dedupeMessagesById(initialMessages));
      setConversationId(currentId);
      prevConversationIdRef.current = currentId;
      autoContinuedRef.current = null;
    }
  }, [initialConversationId, initialMessages, messages.length]);

  const sendMessage = useCallback(
    async ({ content, session, attachments, activeTool, memoryEnabled, thinkingEnabled }: SendMessageOptions) => {
      if (!content.trim() || isLoading) {
        return { success: false, error: "Unable to send message" };
      }

      abortControllerRef.current = new AbortController();
      setIsLoading(true);
      setMemoryStatus(undefined);
      startStreaming(conversationId, abortControllerRef.current);

      try {
        const result = await handleSendMessage(
          content,
          attachments,
          {
            messages: messagesRef.current,
            conversationId,
            abortSignal: abortControllerRef.current!.signal,
            queryClient,
            onMessagesUpdate: setMessages,
            onConversationIdUpdate: (id: string) => {
              setConversationId(id);
              prevConversationIdRef.current = id;
              updateStreamingConversationId(id);
            },
            onNavigate: (path: string) => router.replace(path),
            saveToCacheMutate: saveToCache.mutate,
            onMemoryStatusUpdate: setMemoryStatus,
            onArtifact,
          },
          session,
          activeTool,
          memoryEnabled,
          thinkingEnabled
        );
        return result;
      } catch (error) {
        if (!isAbortError(error)) {
          throw error;
        }

        return { success: false, error: "aborted" };
      } finally {
        setIsLoading(false);
        stopStreamingContext(false);
        abortControllerRef.current = null;
      }
    },
    [isLoading, saveToCache, conversationId, onArtifact, queryClient, startStreaming, stopStreamingContext, updateStreamingConversationId, router]
  );

  const editMessage = useCallback(
    async ({ messageId, content, attachments, session, activeTool, memoryEnabled, thinkingEnabled }: EditMessageOptions) => {
      if (isLoading) return;

      setIsLoading(true);
      setMemoryStatus(undefined);
      abortControllerRef.current = new AbortController();

      startStreaming(conversationId, abortControllerRef.current);

      try {
        await handleEditMessage(
          messageId,
          content,
          attachments,
          {
            messages: messagesRef.current,
            conversationId,
            abortSignal: abortControllerRef.current.signal,
            queryClient,
            session,
            onMessagesUpdate: setMessages,
            saveToCacheMutate: saveToCache.mutate,
            onMemoryStatusUpdate: setMemoryStatus,
            onArtifact,
          },
          activeTool,
          memoryEnabled,
          thinkingEnabled
        );
      } catch (error) {
        if (!isAbortError(error)) {
          throw error;
        }
      } finally {
        setIsLoading(false);
        abortControllerRef.current = null;
        stopStreamingContext(false);
      }
    },
    [isLoading, conversationId, onArtifact, saveToCache, queryClient, startStreaming, stopStreamingContext]
  );

  const regenerateResponse = useCallback(
    async ({ messageId, session, activeTool, memoryEnabled, thinkingEnabled }: RegenerateMessageOptions) => {
      if (isLoading) return;

      setIsLoading(true);
      setMemoryStatus(undefined);
      abortControllerRef.current = new AbortController();

      startStreaming(conversationId, abortControllerRef.current);

      try {
        await handleRegenerateResponse(
          messageId,
          {
            messages: messagesRef.current,
            conversationId,
            abortSignal: abortControllerRef.current.signal,
            queryClient,
            session,
            onMessagesUpdate: setMessages,
            saveToCacheMutate: saveToCache.mutate,
            onMemoryStatusUpdate: setMemoryStatus,
            onArtifact,
          },
          activeTool,
          memoryEnabled,
          thinkingEnabled
        );
      } catch (error) {
        if (!isAbortError(error)) {
          throw error;
        }
      } finally {
        setIsLoading(false);
        abortControllerRef.current = null;
        stopStreamingContext(false);
      }
    },
    [isLoading, conversationId, onArtifact, saveToCache, queryClient, startStreaming, stopStreamingContext]
  );

  const continueConversation = useCallback(
    async ({ userMessage, session, activeTool, memoryEnabled, thinkingEnabled }: ContinueConversationOptions) => {
      if (isLoading || !conversationId) return;

      setIsLoading(true);
      setMemoryStatus(undefined);
      abortControllerRef.current = new AbortController();

      startStreaming(conversationId, abortControllerRef.current);

      try {
        await continueIncompleteConversation(
          userMessage,
          {
            messages: messagesRef.current,
            conversationId,
            abortSignal: abortControllerRef.current.signal,
            queryClient,
            onMessagesUpdate: setMessages,
            saveToCacheMutate: saveToCache.mutate,
            onMemoryStatusUpdate: setMemoryStatus,
            onArtifact,
          },
          session,
          activeTool,
          memoryEnabled,
          thinkingEnabled
        );
      } catch (error) {
        if (!isAbortError(error)) {
          throw error;
        }
      } finally {
        setIsLoading(false);
        abortControllerRef.current = null;
        stopStreamingContext(false);
      }
    },
    [isLoading, conversationId, onArtifact, saveToCache, queryClient, startStreaming, stopStreamingContext]
  );

  const respondToHumanInTheLoop = useCallback(
    async (approved: boolean, response?: string) => {
      if (isLoading || !conversationId) return;

      const model = getModel();
      if (!model) {
        return;
      }

      const currentMessages = messagesRef.current;
      const pendingMessage = currentMessages.findLast(
        (message) => message.role === MessageRole.ASSISTANT && message.metadata?.humanInTheLoopRequest && message.metadata.humanInTheLoopStatus !== "approved" && message.metadata.humanInTheLoopStatus !== "denied"
      );

      if (!pendingMessage?.id) {
        return;
      }

      let assistantMessageId = pendingMessage.id;
      const toolActivities: ToolActivity[] = [...(pendingMessage.toolActivities ?? [])];
      let messageMetadata: MessageMetadata | undefined = {
        ...(pendingMessage.metadata ?? {}),
        humanInTheLoopStatus: approved ? "approved" : "denied",
        humanInTheLoopRequest: undefined,
      };
      const artifactCollector = createArtifactMetadataCollector();
      let resumedContent = "";
      const previousContent = typeof pendingMessage.content === "string" ? pendingMessage.content : "";
      let thinkingAccumulator = previousContent ? pendingMessage.thinking || "" : "";
      const previousMetadata = pendingMessage.metadata;
      if (previousContent && previousContent !== HUMAN_IN_THE_LOOP_PENDING_ASSISTANT_CONTENT) {
        resumedContent = previousContent;
      }

      const updateLocalAssistantMessage = (updates: Partial<Message>, targetMessageId = assistantMessageId) => {
        setMessages((prev) =>
          updateMessageById(prev, targetMessageId, updates)
        );
      };

      abortControllerRef.current = new AbortController();
      setIsLoading(true);
      startStreaming(conversationId, abortControllerRef.current);
      updateLocalAssistantMessage({ content: "", metadata: messageMetadata });

      try {
        const responseContent = await streamChatApproval({
          conversationId,
          threadId: pendingMessage.metadata?.humanInTheLoopRequest?.threadId,
          model,
          approved,
          response,
          signal: abortControllerRef.current.signal,
          onChunk: (delta) => {
            resumedContent += delta;
            updateLocalAssistantMessage({
              content: resumedContent,
              metadata: messageMetadata,
            });
          },
          onToolCall: (toolCall) => {
            toolActivities.push({
              toolCallId: toolCall.toolCallId,
              toolName: toolCall.toolName,
              status: ToolStatus.Calling,
              args: toolCall.args,
              timestamp: Date.now(),
            });
            updateLocalAssistantMessage({ toolActivities: [...toolActivities] });
          },
          onToolResult: (toolResult) => {
            const activityIndex = toolActivities.findIndex(
              (activity) => activity.toolCallId === toolResult.toolCallId
            );
            if (activityIndex !== -1) {
              toolActivities[activityIndex] = {
                ...toolActivities[activityIndex],
                status: ToolStatus.Completed,
                result: toJsonValue(toolResult.result),
                timestamp: Date.now(),
              };
              updateLocalAssistantMessage({ toolActivities: [...toolActivities] });
            }
          },
          onHumanInTheLoopRequest: (request) => {
            messageMetadata = {
              ...messageMetadata,
              humanInTheLoopRequest: toJsonValue(request) as MessageMetadata["humanInTheLoopRequest"],
              humanInTheLoopStatus: "pending",
            };
            updateLocalAssistantMessage({ metadata: messageMetadata });
          },
          onThinking: (delta) => {
            thinkingAccumulator += delta;
            updateLocalAssistantMessage({ thinking: thinkingAccumulator });
          },
          onArtifact: (event) => {
            const eventWithMessage = { ...event, messageId: assistantMessageId };
            artifactCollector.push(eventWithMessage);

            if (event.type === ArtifactEventType.END) {
              const artifacts = artifactCollector.getArtifacts();
              if (artifacts.length > 0) {
                messageMetadata = { ...messageMetadata, artifacts };
                updateLocalAssistantMessage({ metadata: messageMetadata });
              }
            }

            onArtifact?.(eventWithMessage);
          },
        });

        resumedContent = responseContent || resumedContent;
        const artifacts = artifactCollector.getArtifacts();
        if (artifacts.length > 0) {
          messageMetadata = { ...messageMetadata, artifacts };
          updateLocalAssistantMessage({ metadata: messageMetadata });
        }

        const persistableContent =
          getPersistableAssistantContent(resumedContent, messageMetadata) ??
          HUMAN_IN_THE_LOOP_PENDING_ASSISTANT_CONTENT;

        if (persistableContent !== resumedContent) {
          updateLocalAssistantMessage({ content: persistableContent, metadata: messageMetadata });
        }

        try {
          const savedMessage = await updateSavedAssistantMessage(
            conversationId,
            assistantMessageId,
            persistableContent,
            messageMetadata,
            true
          );
          const previousAssistantMessageId = assistantMessageId;
          assistantMessageId = savedMessage.id;
          setMessages((prev) => replaceMessageId(prev, previousAssistantMessageId, savedMessage.id, {
            id: savedMessage.id,
            content: savedMessage.content,
            metadata: messageMetadata,
          }));
        } catch (saveError) {
          if (!isPendingAssistantId(assistantMessageId)) {
            throw saveError;
          }

          const savedAssistantMessageId = await saveAssistantMessage(
            conversationId,
            persistableContent,
            messageMetadata
          );
          if (!savedAssistantMessageId) {
            throw saveError;
          }

          const previousAssistantMessageId = assistantMessageId;
          assistantMessageId = savedAssistantMessageId;
          setMessages((prev) => replaceMessageId(prev, previousAssistantMessageId, savedAssistantMessageId, {
            id: savedAssistantMessageId,
            content: persistableContent,
            metadata: messageMetadata,
          }));
        }

        queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
        queryClient.invalidateQueries({ queryKey: queryKeys.conversation(conversationId) });
      } catch (error) {
        updateLocalAssistantMessage({
          content: previousContent,
          metadata: previousMetadata,
        });
        if (!isAbortError(error)) {
          toast.error(toUserFriendlyError(error, "Failed to process your response. Please try again."));
        }
      } finally {
        setIsLoading(false);
        stopStreamingContext(false);
        abortControllerRef.current = null;
      }
    },
    [conversationId, isLoading, onArtifact, queryClient, startStreaming, stopStreamingContext]
  );

  useEffect(() => {
    if (isLoading || messages.length === 0 || !autoContinue?.session) return;

    const lastMessage = messages[messages.length - 1];
    const lastUserMessage = messages.findLast(msg => msg.role === MessageRole.USER);

    if (lastMessage?.role === MessageRole.ASSISTANT && lastMessage.metadata?.humanInTheLoopStatus === "pending") return;

    const isIncomplete =
      (lastMessage?.role === MessageRole.USER && lastMessage.id) ||
      (lastMessage?.role === MessageRole.ASSISTANT && !lastMessage.content && !lastMessage.metadata?.humanInTheLoopRequest && lastUserMessage?.id);

    if (isIncomplete && lastUserMessage?.id && conversationId) {
      const resumeKey = `${conversationId}:${lastUserMessage.id}`;
      if (autoContinuedRef.current === resumeKey) return;

      const timerId = setTimeout(() => {
        if (autoContinuedRef.current === resumeKey) return;
        autoContinuedRef.current = resumeKey;
        continueConversation({
          userMessage: lastUserMessage,
          session: autoContinue.session,
          activeTool: autoContinue.activeTool ?? null,
          memoryEnabled: autoContinue.memoryEnabled,
          thinkingEnabled: autoContinue.thinkingEnabled,
        });
      }, 0);
      return () => clearTimeout(timerId);
    }
  }, [messages, isLoading, autoContinue, continueConversation, conversationId]);

  const clearChat = useCallback(() => {
    setMessages([]);
    setIsLoading(false);
    setConversationId(null);
    router.push("/");
    toast.success(TOAST_SUCCESS_MESSAGES.CHAT_CLEARED);
  }, [router]);

  const stopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoading(false);
    stopStreamingContext(false);
  }, [stopStreamingContext]);

  useEffect(() => () => { abortControllerRef.current?.abort(); }, [abortControllerRef]);

  return {
    messages,
    isLoading,
    sendMessage,
    editMessage,
    regenerateResponse,
    continueConversation,
    respondToHumanInTheLoop,
    clearChat,
    stopGeneration,
    memoryStatus,
  };
}
