import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { type Message, type Attachment } from "@/lib/schemas/chat";
import { getModel } from "@/lib/storage";
import { DEFAULT_ASSISTANT_PROMPT } from "@/lib/prompts";
import { useSaveToCache } from "./useSemanticCache";
import { TOAST_ERROR_MESSAGES, TOAST_SUCCESS_MESSAGES, HOOK_ERROR_MESSAGES } from "@/constants/errors";
import {
  saveUserMessage,
  checkCache,
  streamChatCompletion,
  buildMessagesForAPI,
  handleConversationSaving,
  buildCacheQuery,
  shouldUseSemanticCache,
} from "./chat/helpers";
import { buildMultimodalContent, extractTextFromContent } from "@/lib/content-utils";

interface UseChatOptions {
  initialMessages?: Message[];
  conversationId?: string | null;
}

interface UseChatReturn {
  messages: Message[];
  isLoading: boolean;
  sendMessage: (content: string, session?: { user: { id: string } }, attachments?: Attachment[]) => Promise<void>;
  clearChat: () => void;
  stopGeneration: () => void;
}

export function useChat(options: UseChatOptions = {}): UseChatReturn {
  const { initialMessages = [], conversationId: initialConversationId } = options;
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(initialConversationId || null);
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
    async (content: string, session?: { user: { id: string } }, attachments?: Attachment[]) => {
      if (!content.trim() || isLoading) return;

      const model = getModel();

      if (!model) {
        toast.error(TOAST_ERROR_MESSAGES.MODEL.NOT_SELECTED);
        return;
      }

      const messageContent = buildMultimodalContent(content.trim(), attachments);

      const userMessage: Message = {
        role: "user",
        content: messageContent,
        id: `user-${Date.now()}`,
        timestamp: Date.now(),
        attachments,
      };

      const assistantMessageId = `assistant-${Date.now()}`;
      let assistantContent = "";

      setMessages((prev) => [
        ...prev,
        userMessage,
        {
          role: "assistant",
          content: "",
          id: assistantMessageId,
          timestamp: Date.now(),
          model: model,
        },
      ]);
      setIsLoading(true);

      try {
        abortControllerRef.current = new AbortController();

        let currentConversationId = conversationId;
        const isNewConversation = !currentConversationId;

        if (currentConversationId) {
          await saveUserMessage(currentConversationId, messageContent, attachments);
        }

        const useCaching = shouldUseSemanticCache(attachments);
        let cacheQuery = '';
        let cacheData: { cached: boolean; response?: string } = { cached: false };

        if (useCaching) {
          cacheQuery = buildCacheQuery(messages, messageContent);
          cacheData = await checkCache(cacheQuery, abortControllerRef.current.signal);
        }
        
        if (useCaching && cacheData.cached && cacheData.response && typeof cacheData.response === 'string') {
          const cachedResponse = cacheData.response;
          assistantContent = cachedResponse;
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessageId
                ? { ...msg, content: assistantContent }
                : msg
            )
          );

          await handleConversationSaving(
            isNewConversation,
            currentConversationId,
            messageContent,
            cachedResponse,
            userMessage.id!,
            assistantMessageId,
            userMessage.timestamp ?? Date.now(),
            queryClient,
            (id) => {
              currentConversationId = id;
              setConversationId(id);
              prevConversationIdRef.current = id;
              router.replace(`/c/${id}`);
            },
            attachments
          );

          setIsLoading(false);
          return;
        }

        const messagesForAPI = buildMessagesForAPI(messages, messageContent, DEFAULT_ASSISTANT_PROMPT);

        const responseContent = await streamChatCompletion(
          messagesForAPI,
          model,
          abortControllerRef.current.signal,
          (fullContent) => {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMessageId
                  ? { ...msg, content: fullContent }
                  : msg
              )
            );
          },
          currentConversationId
        );

        assistantContent = responseContent;

        if (assistantContent && !abortControllerRef.current?.signal.aborted) {
          if (useCaching && cacheQuery) {
            saveToCache.mutate({
              query: cacheQuery,
              response: assistantContent,
            });
          }

          await handleConversationSaving(
            isNewConversation,
            currentConversationId,
            messageContent,
            assistantContent,
            userMessage.id!,
            assistantMessageId,
            userMessage.timestamp ?? Date.now(),
            queryClient,
            (id) => {
              currentConversationId = id;
              setConversationId(id);
              prevConversationIdRef.current = id;
              router.replace(`/c/${id}`);
            },
            attachments
          );

          if (session?.user?.id) {
            const textContent = extractTextFromContent(messageContent);
            
            fetch('/api/memory/store', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userMessage: textContent,
                assistantMessage: assistantContent,
                conversationId: currentConversationId,
              }),
            }).catch(err => console.error('[Memory] Storage failed:', err));
          }
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          toast.info(TOAST_SUCCESS_MESSAGES.GENERATION_STOPPED);
          return;
        }
        
        const errorMessage = err instanceof Error ? err.message : HOOK_ERROR_MESSAGES.UNKNOWN_ERROR_OCCURRED;
        toast.error(TOAST_ERROR_MESSAGES.CHAT.FAILED_SEND, {
          description: errorMessage,
        });
        
        setMessages((prev) => prev.filter((msg) => msg.id !== assistantMessageId));
      } finally {
        setIsLoading(false);
        abortControllerRef.current = null;
      }
    },
    [messages, isLoading, saveToCache, conversationId, router, queryClient]
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

  // Cleanup abort controller on unmount
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
    clearChat,
    stopGeneration,
  };
}
