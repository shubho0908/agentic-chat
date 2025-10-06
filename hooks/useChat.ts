import { useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import type { Message } from "@/lib/schemas/chat";
import { getModel } from "@/lib/storage";
import { getApiKeyHash } from "./useApiKey";
import { DEFAULT_ASSISTANT_PROMPT } from "@/lib/prompts";
import { useSaveToCache } from "./useSemanticCache";

interface UseChatOptions {
  initialMessages?: Message[];
}

interface UseChatReturn {
  messages: Message[];
  isLoading: boolean;
  sendMessage: (content: string) => Promise<void>;
  clearChat: () => void;
  stopGeneration: () => void;
}

export function useChat(options: UseChatOptions = {}): UseChatReturn {
  const { initialMessages = [] } = options;
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [isLoading, setIsLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const saveToCache = useSaveToCache();

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isLoading) return;

      const userMessage: Message = {
        role: "user",
        content: content.trim(),
        id: `user-${Date.now()}`,
        timestamp: Date.now(),
      };

      const assistantMessageId = `assistant-${Date.now()}`;
      let assistantContent = "";

      const model = getModel();

      if (!model) {
        toast.error("Model not selected");
        return;
      }

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

        const userHash = await getApiKeyHash();
        
        if (!userHash) {
          throw new Error("Failed to generate user hash");
        }

        const cacheCheckResponse = await fetch("/api/cache/check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: content.trim(),
            userHash,
          }),
          signal: abortControllerRef.current.signal,
        });

        if (cacheCheckResponse.ok) {
          const cacheData = await cacheCheckResponse.json();
          
          if (cacheData.cached) {
            assistantContent = cacheData.response;
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMessageId
                  ? { ...msg, content: assistantContent }
                  : msg
              )
            );
            setIsLoading(false);
            return;
          }
        }

        const messagesForAPI = [
          {
            role: "system" as const,
            content: DEFAULT_ASSISTANT_PROMPT,
          },
          ...messages.map(({ role, content }) => ({
            role: role as "user" | "assistant" | "system",
            content,
          })),
          {
            role: "user" as const,
            content: content.trim(),
          },
        ];

        const response = await fetch('/api/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            messages: messagesForAPI,
            stream: true,
          }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to send message');
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) {
          throw new Error('No response stream');
        }

        while (true) {
          const { done, value } = await reader.read();
          
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n').filter(line => line.trim().startsWith('data:'));

          for (const line of lines) {
            const data = line.replace(/^data: /, '').trim();
            
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              if (parsed.content) {
                assistantContent += parsed.content;

                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMessageId
                      ? { ...msg, content: assistantContent }
                      : msg
                  )
                );
              }
            } catch {
            }
          }
        }

        if (assistantContent && !abortControllerRef.current?.signal.aborted) {
          saveToCache.mutate({
            query: content.trim(),
            response: assistantContent,
            userHash,
          });
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          toast.info("Generation stopped");
          return;
        }
        
        const errorMessage = err instanceof Error ? err.message : "Unknown error occurred";
        toast.error("Failed to send message", {
          description: errorMessage,
        });
        
        setMessages((prev) => prev.filter((msg) => msg.id !== assistantMessageId));
      } finally {
        setIsLoading(false);
        abortControllerRef.current = null;
      }
    },
    [messages, isLoading, saveToCache]
  );

  const clearChat = useCallback(() => {
    setMessages([]);
    setIsLoading(false);
    toast.success("Chat cleared");
  }, []);

  const stopGeneration = useCallback(() => {
    abortControllerRef.current?.abort();
    setIsLoading(false);
  }, []);

  return {
    messages,
    isLoading,
    sendMessage,
    clearChat,
    stopGeneration,
  };
}
