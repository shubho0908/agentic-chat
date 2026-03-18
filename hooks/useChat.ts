import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { type Message } from "@/lib/schemas/chat";
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

function isAbortError(error: unknown): boolean {
  return (
    error instanceof DOMException && error.name === "AbortError"
  ) || (
    error instanceof Error && error.name === "AbortError"
  );
}

export function useChat(options: UseChatOptions = {}): UseChatReturn {
  const { initialMessages = [], conversationId: initialConversationId } = options;
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(initialConversationId || null);
  const [memoryStatus, setMemoryStatus] = useState<MemoryStatus | undefined>();
  const abortControllerRef = useRef<AbortController | null>(null);
  const saveToCache = useSaveToCache();
  const router = useRouter();
  const queryClient = useQueryClient();
  const prevConversationIdRef = useRef<string | null>(initialConversationId || null);
  const { startStreaming, stopStreaming: stopStreamingContext, updateStreamingConversationId } = useStreaming();

  useEffect(() => {
    const currentId = initialConversationId || null;
    const prevId = prevConversationIdRef.current;
    const isNavigatingToExistingConversation = currentId !== null && prevId !== currentId && initialMessages.length > 0;
    const messagesJustLoaded = messages.length === 0 && initialMessages.length > 0 && currentId !== null;
    if (isNavigatingToExistingConversation || messagesJustLoaded) {
      setMessages(initialMessages);
      setConversationId(currentId);
      prevConversationIdRef.current = currentId;
    }
  }, [initialConversationId, initialMessages, messages.length]);

  const sendMessage = useCallback(
    async ({ content, session, attachments, activeTool, memoryEnabled, deepResearchEnabled, searchDepth }: SendMessageOptions) => {
      if (!content.trim() || isLoading) return;

      const isNewConversation = !conversationId;
      abortControllerRef.current = new AbortController();
      if (!isNewConversation) {
        setIsLoading(true);
        setMemoryStatus(undefined);
        startStreaming(conversationId, abortControllerRef.current);
      }

      try {
        await handleSendMessage(
          content,
          attachments,
          {
            messages,
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
          },
          session,
          activeTool,
          memoryEnabled,
          deepResearchEnabled,
          searchDepth
        );
        if (isNewConversation) {
          return;
        }
      } catch (error) {
        if (!isAbortError(error)) {
          throw error;
        }
      } finally {
        if (!isNewConversation) {
          setIsLoading(false);
          stopStreamingContext(false);
        }
        abortControllerRef.current = null;
      }
    },
    [messages, isLoading, saveToCache, conversationId, queryClient, startStreaming, stopStreamingContext, updateStreamingConversationId, router]
  );

  const editMessage = useCallback(
    async ({ messageId, content, attachments, session, activeTool, memoryEnabled, deepResearchEnabled, searchDepth }: EditMessageOptions) => {
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
            messages,
            conversationId,
            abortSignal: abortControllerRef.current.signal,
            queryClient,
            session,
            onMessagesUpdate: setMessages,
            saveToCacheMutate: saveToCache.mutate,
            onMemoryStatusUpdate: setMemoryStatus,
          },
          activeTool,
          memoryEnabled,
          deepResearchEnabled,
          searchDepth
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
    [messages, isLoading, conversationId, saveToCache, queryClient, startStreaming, stopStreamingContext]
  );

  const regenerateResponse = useCallback(
    async ({ messageId, session, activeTool, memoryEnabled, deepResearchEnabled, searchDepth }: RegenerateMessageOptions) => {
      if (isLoading) return;

      setIsLoading(true);
      setMemoryStatus(undefined);
      abortControllerRef.current = new AbortController();

      startStreaming(conversationId, abortControllerRef.current);

      try {
        await handleRegenerateResponse(
          messageId,
          {
            messages,
            conversationId,
            abortSignal: abortControllerRef.current.signal,
            queryClient,
            session,
            onMessagesUpdate: setMessages,
            saveToCacheMutate: saveToCache.mutate,
            onMemoryStatusUpdate: setMemoryStatus,
          },
          activeTool,
          memoryEnabled,
          deepResearchEnabled,
          searchDepth
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
    [messages, isLoading, conversationId, saveToCache, queryClient, startStreaming, stopStreamingContext]
  );

  const continueConversation = useCallback(
    async ({ userMessage, session, activeTool, memoryEnabled, deepResearchEnabled, searchDepth }: ContinueConversationOptions) => {
      if (isLoading || !conversationId) return;

      setIsLoading(true);
      setMemoryStatus(undefined);
      abortControllerRef.current = new AbortController();

      startStreaming(conversationId, abortControllerRef.current);

      try {
        await continueIncompleteConversation(
          userMessage,
          {
            messages,
            conversationId,
            abortSignal: abortControllerRef.current.signal,
            queryClient,
            onMessagesUpdate: setMessages,
            saveToCacheMutate: saveToCache.mutate,
            onMemoryStatusUpdate: setMemoryStatus,
          },
          session,
          activeTool,
          memoryEnabled,
          deepResearchEnabled,
          searchDepth
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
    [messages, isLoading, conversationId, saveToCache, queryClient, startStreaming, stopStreamingContext]
  );

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

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, []);

  return {
    messages,
    isLoading,
    sendMessage,
    editMessage,
    regenerateResponse,
    continueConversation,
    clearChat,
    stopGeneration,
    memoryStatus,
  };
}
