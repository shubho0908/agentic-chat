import { useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import OpenAI from "openai";
import type { Message } from "@/lib/schemas/chat";
import { getApiKey, getModel, getApiKeyHash } from "@/lib/storage";
import { DEFAULT_ASSISTANT_PROMPT } from "@/lib/prompts";

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

      const apiKey = getApiKey();
      const model = getModel();

      if (!apiKey) {
        toast.error("API key not found");
        return;
      }

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

        const openai = new OpenAI({
          apiKey: apiKey,
          dangerouslyAllowBrowser: true,
        });

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

        const stream = await openai.chat.completions.create({
          model: model,
          messages: messagesForAPI,
          stream: true,
        });

        for await (const chunk of stream) {
          if (abortControllerRef.current?.signal.aborted) {
            break;
          }

          const delta = chunk.choices[0]?.delta?.content || "";
          assistantContent += delta;

          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessageId
                ? { ...msg, content: assistantContent }
                : msg
            )
          );
        }

        if (assistantContent && !abortControllerRef.current?.signal.aborted) {
          await fetch("/api/cache/save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              query: content.trim(),
              response: assistantContent,
              userHash,
            }),
          }).catch(() => {
            // Silent fail for cache save
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
    [messages, isLoading]
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
