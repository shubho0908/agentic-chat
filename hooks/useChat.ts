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
  updateUserMessage,
  checkCache,
  streamChatCompletion,
  buildMessagesForAPI,
  handleConversationSaving,
  buildCacheQuery,
  shouldUseSemanticCache,
} from "./chat/helpers";
import { buildMultimodalContent, extractTextFromContent } from "@/lib/content-utils";

interface VersionData {
  id: string;
  role: string;
  content: string;
  createdAt: string;
  siblingIndex: number;
  attachments?: Attachment[];
}

interface UseChatOptions {
  initialMessages?: Message[];
  conversationId?: string | null;
}

interface UseChatReturn {
  messages: Message[];
  isLoading: boolean;
  sendMessage: (content: string, session?: { user: { id: string } }, attachments?: Attachment[]) => Promise<void>;
  editMessage: (messageId: string, newContent: string, attachments?: Attachment[]) => Promise<void>;
  regenerateResponse: (messageId: string) => Promise<void>;
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

        let savedUserMessageId: string | null = null;
        if (currentConversationId) {
          savedUserMessageId = await saveUserMessage(currentConversationId, messageContent, attachments);
          if (savedUserMessageId) {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === userMessage.id
                  ? { ...msg, id: savedUserMessageId! }
                  : msg
              )
            );
          }
        }

        const useCaching = shouldUseSemanticCache(attachments);
        let cacheQuery = '';
        let cacheData: { cached: boolean; response?: string } = { cached: false };

        if (useCaching && abortControllerRef.current) {
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
            userMessage.timestamp ?? Date.now(),
            queryClient,
            (data) => {
              currentConversationId = data.conversationId;
              setConversationId(data.conversationId);
              prevConversationIdRef.current = data.conversationId;
              setMessages((prev) =>
                prev.map((msg) => {
                  if (msg.id === userMessage.id) {
                    return { ...msg, id: data.userMessageId };
                  }
                  if (msg.id === assistantMessageId) {
                    return { ...msg, id: data.assistantMessageId };
                  }
                  return msg;
                })
              );
              router.replace(`/c/${data.conversationId}`);
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
            userMessage.timestamp ?? Date.now(),
            queryClient,
            (data) => {
              currentConversationId = data.conversationId;
              setConversationId(data.conversationId);
              prevConversationIdRef.current = data.conversationId;
              setMessages((prev) =>
                prev.map((msg) => {
                  if (msg.id === userMessage.id) {
                    return { ...msg, id: data.userMessageId };
                  }
                  if (msg.id === assistantMessageId) {
                    return { ...msg, id: data.assistantMessageId };
                  }
                  return msg;
                })
              );
              router.replace(`/c/${data.conversationId}`);
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

  const editMessage = useCallback(
    async (messageId: string, newContent: string, attachments?: Attachment[]) => {
      if (isLoading) return;
      
      const messageIndex = messages.findIndex((m) => m.id === messageId);
      if (messageIndex === -1) return;

      const messageToEdit = messages[messageIndex];
      if (messageToEdit.role !== "user") return;

      const model = getModel();
      if (!model) {
        toast.error(TOAST_ERROR_MESSAGES.MODEL.NOT_SELECTED);
        return;
      }

      const messageContent = buildMultimodalContent(newContent, attachments);

      const assistantMessageId = `assistant-${Date.now()}`;
      let assistantContent = "";

      const messagesUpToEdit = messages.slice(0, messageIndex);
      const originalMessagesState = [...messages];
      
      const existingVersions = messageToEdit.versions || [];
      const cleanedVersions = existingVersions.filter(v => v.id && !v.id.startsWith('temp-'));
      
      const maxSiblingIndex = cleanedVersions.length > 0 
        ? Math.max(...cleanedVersions.map(v => v.siblingIndex ?? 0))
        : 0;
      
      const newEditedVersion: Message = {
        id: `temp-edit-${Date.now()}`,
        role: "user",
        content: messageContent,
        timestamp: Date.now(),
        attachments,
        siblingIndex: maxSiblingIndex + 1,
      };
      
      const updatedVersions = [...cleanedVersions, newEditedVersion];
      
      setMessages([
        ...messagesUpToEdit,
        {
          ...messageToEdit,
          content: messageContent,
          attachments,
          versions: updatedVersions,
        },
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

        let updatedMessageId = messageToEdit.id;
        let updatedMessageData: { parentMessageId?: string | null } | null = null;
        if (conversationId && messageToEdit.id) {
          const updatedMessage = await updateUserMessage(conversationId, messageToEdit.id, messageContent, attachments);
          if (updatedMessage?.id) {
            updatedMessageId = updatedMessage.id;
            updatedMessageData = { parentMessageId: updatedMessage.parentMessageId };
          }
        }

        const useCaching = shouldUseSemanticCache(attachments);
        let cacheQuery = '';
        let cacheData: { cached: boolean; response?: string } = { cached: false };

        if (useCaching && abortControllerRef.current) {
          cacheQuery = buildCacheQuery(messagesUpToEdit, messageContent);
          cacheData = await checkCache(cacheQuery, abortControllerRef.current.signal);
        }
        
        if (useCaching && cacheData.cached && cacheData.response && typeof cacheData.response === 'string') {
          assistantContent = cacheData.response;
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessageId
                ? { ...msg, content: assistantContent }
                : msg
            )
          );

          if (conversationId) {
            const response = await fetch(`/api/conversations/${conversationId}/messages`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                role: "ASSISTANT",
                content: assistantContent,
              }),
            });
            
            if (response.ok) {
              const savedAssistantMessage = await response.json();
              if (savedAssistantMessage?.id) {
                const parentId = updatedMessageData?.parentMessageId || updatedMessageId;
                
                const versionsResponse = await fetch(
                  `/api/conversations/${conversationId}/messages/${parentId}/versions`
                );
                
                let versions: Message[] = [];
                if (versionsResponse.ok) {
                  const versionsData = await versionsResponse.json();
                  if (versionsData?.versions && Array.isArray(versionsData.versions)) {
                    versions = versionsData.versions.map((v: VersionData) => ({
                      id: v.id,
                      role: v.role as 'user' | 'assistant',
                      content: v.content,
                      timestamp: new Date(v.createdAt).getTime(),
                      attachments: v.attachments || [],
                      siblingIndex: v.siblingIndex,
                    }));
                  }
                }
                
                setMessages((prev) =>
                  prev.map((msg) => {
                    if (msg.id === messageToEdit.id || msg.id === updatedMessageId) {
                      return { 
                        ...msg, 
                        id: updatedMessageId!,
                        versions: versions.length > 0 ? versions : msg.versions 
                      };
                    }
                    if (msg.id === assistantMessageId) {
                      return { ...msg, id: savedAssistantMessage.id };
                    }
                    return msg;
                  })
                );
              }
            }
          }

          setIsLoading(false);
          return;
        }

        const messagesForAPI = buildMessagesForAPI(messagesUpToEdit, messageContent, DEFAULT_ASSISTANT_PROMPT);

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
          conversationId
        );

        assistantContent = responseContent;

        if (assistantContent && !abortControllerRef.current?.signal.aborted) {
          if (useCaching && cacheQuery) {
            saveToCache.mutate({
              query: cacheQuery,
              response: assistantContent,
            });
          }

          if (conversationId) {
            const response = await fetch(`/api/conversations/${conversationId}/messages`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                role: "ASSISTANT",
                content: assistantContent,
              }),
            });
            
            if (response.ok) {
              const savedAssistantMessage = await response.json();
              if (savedAssistantMessage?.id) {
                const parentId = updatedMessageData?.parentMessageId || updatedMessageId;
                
                const versionsResponse = await fetch(
                  `/api/conversations/${conversationId}/messages/${parentId}/versions`
                );
                
                let versions: Message[] = [];
                if (versionsResponse.ok) {
                  const versionsData = await versionsResponse.json();
                  if (versionsData?.versions && Array.isArray(versionsData.versions)) {
                    versions = versionsData.versions.map((v: VersionData) => ({
                      id: v.id,
                      role: v.role as 'user' | 'assistant',
                      content: v.content,
                      timestamp: new Date(v.createdAt).getTime(),
                      attachments: v.attachments || [],
                      siblingIndex: v.siblingIndex,
                    }));
                  }
                }
                
                setMessages((prev) =>
                  prev.map((msg) => {
                    if (msg.id === messageToEdit.id || msg.id === updatedMessageId) {
                      return { 
                        ...msg, 
                        id: updatedMessageId!,
                        versions: versions.length > 0 ? versions : msg.versions 
                      };
                    }
                    if (msg.id === assistantMessageId) {
                      return { ...msg, id: savedAssistantMessage.id };
                    }
                    return msg;
                  })
                );
              }
            }
            
            queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] });
          }
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          setMessages(messagesUpToEdit);
          toast.info(TOAST_SUCCESS_MESSAGES.GENERATION_STOPPED);
          return;
        }
        
        const errorMessage = err instanceof Error ? err.message : HOOK_ERROR_MESSAGES.UNKNOWN_ERROR_OCCURRED;
        toast.error(TOAST_ERROR_MESSAGES.CHAT.FAILED_SEND, {
          description: errorMessage,
        });
        
        setMessages(originalMessagesState);
      } finally {
        setIsLoading(false);
        abortControllerRef.current = null;
      }
    },
    [messages, isLoading, conversationId, saveToCache, queryClient]
  );

  const regenerateResponse = useCallback(
    async (messageId: string) => {
      if (isLoading) return;

      const messageIndex = messages.findIndex((m) => m.id === messageId);
      if (messageIndex === -1 || messageIndex === 0) return;

      const assistantMessage = messages[messageIndex];
      if (assistantMessage.role !== "assistant") return;

      const previousUserMessage = messages[messageIndex - 1];
      if (previousUserMessage.role !== "user") return;

      const model = getModel();
      if (!model) {
        toast.error(TOAST_ERROR_MESSAGES.MODEL.NOT_SELECTED);
        return;
      }

      const originalMessagesState = [...messages];
      
      const existingVersions = assistantMessage.versions || [];
      const cleanedVersions = existingVersions.filter(v => v.id && !v.id.startsWith('temp-'));
      
      const maxSiblingIndex = cleanedVersions.length > 0 
        ? Math.max(...cleanedVersions.map(v => v.siblingIndex ?? 0))
        : 0;
      
      const newRegeneratedVersion: Message = {
        id: `temp-regen-${Date.now()}`,
        role: "assistant",
        content: "",
        timestamp: Date.now(),
        model: model,
        siblingIndex: maxSiblingIndex + 1,
      };
      
      const updatedVersions = [...cleanedVersions, newRegeneratedVersion];

      const updatedAssistantMessage: Message = {
        ...assistantMessage,
        content: "",
        versions: updatedVersions,
      };

      const messagesUpToAssistant = messages.slice(0, messageIndex);
      setMessages([...messagesUpToAssistant, updatedAssistantMessage]);
      setIsLoading(true);

      try {
        abortControllerRef.current = new AbortController();

        if (conversationId && assistantMessage.id) {
          await fetch(`/api/conversations/${conversationId}/messages/delete-after`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messageId: assistantMessage.id }),
          });
        }

        const useCaching = shouldUseSemanticCache(previousUserMessage.attachments);
        let cacheQuery = '';
        let cacheData: { cached: boolean; response?: string } = { cached: false };

        if (useCaching && abortControllerRef.current) {
          cacheQuery = buildCacheQuery(messagesUpToAssistant, previousUserMessage.content);
          cacheData = await checkCache(cacheQuery, abortControllerRef.current.signal);
        }
        
        if (useCaching && cacheData.cached && cacheData.response && typeof cacheData.response === 'string') {
          const cachedResponse = cacheData.response;
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessage.id
                ? { ...msg, content: cachedResponse }
                : msg
            )
          );

          if (conversationId && assistantMessage.id) {
            const response = await fetch(`/api/conversations/${conversationId}/messages/${assistantMessage.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                content: cachedResponse,
                attachments: [],
              }),
            });
            
            if (response.ok) {
              const updatedMessage = await response.json();
              if (updatedMessage?.id) {
                const parentId = updatedMessage.parentMessageId || updatedMessage.id;
                
                const versionsResponse = await fetch(
                  `/api/conversations/${conversationId}/messages/${parentId}/versions`
                );
                
                let versions: Message[] = [];
                if (versionsResponse.ok) {
                  const versionsData = await versionsResponse.json();
                  if (versionsData?.versions && Array.isArray(versionsData.versions)) {
                    versions = versionsData.versions.map((v: VersionData) => ({
                      id: v.id,
                      role: v.role as 'user' | 'assistant',
                      content: v.content,
                      timestamp: new Date(v.createdAt).getTime(),
                      attachments: v.attachments || [],
                      siblingIndex: v.siblingIndex,
                    }));
                  }
                }
                
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMessage.id || msg.id === updatedMessage.id
                      ? { ...msg, id: updatedMessage.id, versions: versions.length > 0 ? versions : msg.versions }
                      : msg
                  )
                );
              }
            }
          }

          setIsLoading(false);
          return;
        }

        const messagesForAPI = buildMessagesForAPI(messagesUpToAssistant, previousUserMessage.content, DEFAULT_ASSISTANT_PROMPT);

        const responseContent = await streamChatCompletion(
          messagesForAPI,
          model,
          abortControllerRef.current.signal,
          (fullContent) => {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMessage.id
                  ? { ...msg, content: fullContent }
                  : msg
              )
            );
          },
          conversationId
        );

        if (responseContent && !abortControllerRef.current?.signal.aborted) {
          if (useCaching && cacheQuery) {
            saveToCache.mutate({
              query: cacheQuery,
              response: responseContent,
            });
          }

          if (conversationId && assistantMessage.id) {
            const response = await fetch(`/api/conversations/${conversationId}/messages/${assistantMessage.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                content: responseContent,
                attachments: [],
              }),
            });
            
            if (response.ok) {
              const updatedMessage = await response.json();
              if (updatedMessage?.id) {
                const parentId = updatedMessage.parentMessageId || updatedMessage.id;
                
                const versionsResponse = await fetch(
                  `/api/conversations/${conversationId}/messages/${parentId}/versions`
                );
                
                let versions: Message[] = [];
                if (versionsResponse.ok) {
                  const versionsData = await versionsResponse.json();
                  if (versionsData?.versions && Array.isArray(versionsData.versions)) {
                    versions = versionsData.versions.map((v: VersionData) => ({
                      id: v.id,
                      role: v.role as 'user' | 'assistant',
                      content: v.content,
                      timestamp: new Date(v.createdAt).getTime(),
                      attachments: v.attachments || [],
                      siblingIndex: v.siblingIndex,
                    }));
                  }
                }
                
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMessage.id || msg.id === updatedMessage.id
                      ? { ...msg, id: updatedMessage.id, versions: versions.length > 0 ? versions : msg.versions }
                      : msg
                  )
                );
              }
            }
            
            queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] });
          }
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          setMessages(messagesUpToAssistant);
          toast.info(TOAST_SUCCESS_MESSAGES.GENERATION_STOPPED);
          return;
        }
        
        const errorMessage = err instanceof Error ? err.message : HOOK_ERROR_MESSAGES.UNKNOWN_ERROR_OCCURRED;
        toast.error(TOAST_ERROR_MESSAGES.CHAT.FAILED_SEND, {
          description: errorMessage,
        });
        
        setMessages(originalMessagesState);
      } finally {
        setIsLoading(false);
        abortControllerRef.current = null;
      }
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
  };
}
