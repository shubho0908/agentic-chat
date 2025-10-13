import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { type Message, type Attachment } from "@/lib/schemas/chat";
import { useSaveToCache } from "./useSemanticCache";
import { TOAST_SUCCESS_MESSAGES } from "@/constants/toasts";
import type { UseChatOptions, UseChatReturn, MemoryStatus } from "@/types/chat";
import { handleSendMessage } from "./chat/message-sender";
import { handleEditMessage } from "./chat/message-editor";
import { handleRegenerateResponse } from "./chat/message-regenerator";

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
    async ({ content, session, attachments, activeTool, memoryEnabled }: { content: string; session?: { user: { id: string } }; attachments?: Attachment[]; activeTool?: string | null; memoryEnabled?: boolean }) => {
      if (!content.trim() || isLoading) return;

      setIsLoading(true);
      setMemoryStatus(undefined);
      abortControllerRef.current = new AbortController();

      await handleSendMessage(
        content,
        attachments,
        {
          messages,
          conversationId,
          abortSignal: abortControllerRef.current.signal,
          queryClient,
          onMessagesUpdate: setMessages,
          onConversationIdUpdate: (id: string) => {
            setConversationId(id);
            prevConversationIdRef.current = id;
          },
          onNavigate: (path: string) => router.replace(path),
          saveToCacheMutate: saveToCache.mutate,
          onMemoryStatusUpdate: setMemoryStatus,
        },
        session,
        activeTool,
        memoryEnabled
      );

      setIsLoading(false);
      abortControllerRef.current = null;
    },
    [messages, isLoading, saveToCache, conversationId, router, queryClient]
  );

  const editMessage = useCallback(
    async ({ messageId, content, attachments, activeTool, memoryEnabled }: { messageId: string; content: string; attachments?: Attachment[]; activeTool?: string | null; memoryEnabled?: boolean }) => {
      if (isLoading) return;

      setIsLoading(true);
      setMemoryStatus(undefined);
      abortControllerRef.current = new AbortController();

      await handleEditMessage(
        messageId,
        content,
        attachments,
        {
          messages,
          conversationId,
          abortSignal: abortControllerRef.current.signal,
          queryClient,
          onMessagesUpdate: setMessages,
          saveToCacheMutate: saveToCache.mutate,
          onMemoryStatusUpdate: setMemoryStatus,
        },
        activeTool,
        memoryEnabled
      );

      setIsLoading(false);
      abortControllerRef.current = null;
    },
    [messages, isLoading, conversationId, saveToCache, queryClient]
  );

  const regenerateResponse = useCallback(
    async ({ messageId, activeTool, memoryEnabled }: { messageId: string; activeTool?: string | null; memoryEnabled?: boolean }) => {
      if (isLoading) return;

      setIsLoading(true);
      setMemoryStatus(undefined);
      abortControllerRef.current = new AbortController();

      await handleRegenerateResponse(
        messageId,
        {
          messages,
          conversationId,
          abortSignal: abortControllerRef.current.signal,
          queryClient,
          onMessagesUpdate: setMessages,
          saveToCacheMutate: saveToCache.mutate,
          onMemoryStatusUpdate: setMemoryStatus,
        },
        activeTool,
        memoryEnabled
      );

      setIsLoading(false);
      abortControllerRef.current = null;
    },
    [messages, isLoading, conversationId, saveToCache, queryClient]
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
  }, []);

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
    clearChat,
    stopGeneration,
    memoryStatus,
  };
}
