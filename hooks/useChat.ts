import { useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import type { Message } from "@/lib/schemas/chat";

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

      setMessages((prev) => [
        ...prev,
        userMessage,
        {
          role: "assistant",
          content: "",
          id: assistantMessageId,
          timestamp: Date.now(),
        },
      ]);
      setIsLoading(true);

      try {
        abortControllerRef.current = new AbortController();
        
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [...messages, userMessage].map(({ role, content }) => ({
              role,
              content,
            })),
          }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to send message");
        }

        const contentType = response.headers.get("content-type");
        
        if (contentType?.includes("application/json")) {
          const data = await response.json();
          assistantContent = data.content;
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessageId
                ? { ...msg, content: assistantContent }
                : msg
            )
          );
        } else {
          const reader = response.body?.getReader();
          const decoder = new TextDecoder();

          if (!reader) {
            throw new Error("Response body is not readable");
          }

          while (true) {
            const { done, value } = await reader.read();
            
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            assistantContent += chunk;

            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMessageId
                  ? { ...msg, content: assistantContent }
                  : msg
              )
            );
          }
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
