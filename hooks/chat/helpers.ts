import { type Message } from "@/lib/schemas/chat";
import { QueryClient } from "@tanstack/react-query";

export function generateTitle(content: string): string {
  const maxLength = 50;
  const cleaned = content.trim().replace(/\n/g, ' ');
  if (cleaned.length <= maxLength) return cleaned;
  return cleaned.substring(0, maxLength).trim() + '...';
}

export async function saveUserMessage(
  conversationId: string,
  content: string
): Promise<void> {
  try {
    await fetch(`/api/conversations/${conversationId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        role: "USER",
        content,
      }),
    });
  } catch (err) {
    console.error("Failed to save user message:", err);
  }
}

export async function saveAssistantMessage(
  conversationId: string,
  content: string
): Promise<void> {
  try {
    await fetch(`/api/conversations/${conversationId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        role: "ASSISTANT",
        content,
      }),
    });
  } catch (err) {
    console.error("Failed to save assistant message:", err);
  }
}

export async function createNewConversation(
  userContent: string,
  assistantContent: string
): Promise<string | null> {
  try {
    const title = generateTitle(userContent);
    const createResponse = await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });

    if (!createResponse.ok) return null;

    const newConversation = await createResponse.json();
    const conversationId = newConversation.id;

    await saveUserMessage(conversationId, userContent);
    await saveAssistantMessage(conversationId, assistantContent);

    return conversationId;
  } catch (err) {
    console.error("Failed to create conversation:", err);
    return null;
  }
}

export function updateQueryCache(
  queryClient: QueryClient,
  conversationId: string,
  userContent: string,
  assistantContent: string,
  userMessageId: string,
  assistantMessageId: string,
  userTimestamp: number
): void {
  const title = generateTitle(userContent);
  queryClient.setQueryData(["conversation", conversationId], {
    conversation: {
      id: conversationId,
      title,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    messages: {
      items: [
        {
          id: userMessageId,
          role: "user" as const,
          content: userContent,
          createdAt: new Date(userTimestamp).toISOString(),
        },
        {
          id: assistantMessageId,
          role: "assistant" as const,
          content: assistantContent,
          createdAt: new Date().toISOString(),
        },
      ],
    },
  });
  queryClient.invalidateQueries({ queryKey: ["conversations"] });
}

export function buildCacheQuery(messages: Message[], newContent: string): string {
  const recentMessages = messages.slice(-4);
  const contextParts = recentMessages.map(m => `${m.role}: ${m.content}`);
  contextParts.push(`user: ${newContent}`);
  return contextParts.join('\n');
}

export async function checkCache(
  query: string,
  signal: AbortSignal
): Promise<{ cached: boolean; response?: string }> {
  try {
    const response = await fetch("/api/cache/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
      signal,
    });

    if (response.ok) {
      return await response.json();
    }
  } catch (err) {
    console.error("Cache check failed:", err);
  }
  return { cached: false };
}

export async function streamChatCompletion(
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>,
  model: string,
  signal: AbortSignal,
  onChunk: (fullContent: string) => void
): Promise<string> {
  const response = await fetch('/api/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
    }),
    signal,
  });

  if (!response.ok) {
    let errorMessage = 'Failed to send message';
    try {
      const errorData = await response.json();
      errorMessage = errorData.error || errorMessage;
    } catch {
      // If we can't parse the error response, use status text
      errorMessage = response.statusText || errorMessage;
    }
    throw new Error(errorMessage);
  }

  const reader = response.body?.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: false });

  if (!reader) {
    throw new Error("No response stream available");
  }

  let fullContent = "";
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      
      const chunk = decoder.decode(value, { stream: !done });
      buffer += chunk;

      const lines = buffer.split('\n');
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmedLine = line.trim();
        
        if (!trimmedLine || !trimmedLine.startsWith('data:')) continue;

        const data = trimmedLine.slice(5).trim();
        
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          
          // Check for error in stream
          if (parsed.error) {
            throw new Error(parsed.error);
          }
          
          if (parsed.content) {
            fullContent += parsed.content;
            onChunk(fullContent);
          }
        } catch (err) {
          // If it's an Error we threw, re-throw it
          if (err instanceof Error && err.message !== 'Unexpected token') {
            throw err;
          }
          console.warn('Failed to parse SSE data:', data, err);
        }
      }

      if (done) {
        if (buffer.trim()) {
          const trimmedLine = buffer.trim();
          if (trimmedLine.startsWith('data:')) {
            const data = trimmedLine.slice(5).trim();
            if (data !== '[DONE]') {
              try {
                const parsed = JSON.parse(data);
                
                // Check for error in stream
                if (parsed.error) {
                  throw new Error(parsed.error);
                }
                
                if (parsed.content) {
                  fullContent += parsed.content;
                  onChunk(fullContent);
                }
              } catch (err) {
                // If it's an Error we threw, re-throw it
                if (err instanceof Error && err.message !== 'Unexpected token') {
                  throw err;
                }
                console.warn('Failed to parse final SSE data:', data, err);
              }
            }
          }
        }
        break;
      }
    }
  } catch (error) {
    // Clean up the reader
    reader.cancel();
    throw error;
  }

  return fullContent;
}

export function buildMessagesForAPI(
  messages: Message[],
  newContent: string,
  systemPrompt: string
): Array<{ role: "user" | "assistant" | "system"; content: string }> {
  return [
    {
      role: "system" as const,
      content: systemPrompt,
    },
    ...messages.map(({ role, content }) => ({
      role: role as "user" | "assistant" | "system",
      content,
    })),
    {
      role: "user" as const,
      content: newContent,
    },
  ];
}

export async function handleConversationSaving(
  isNewConversation: boolean,
  currentConversationId: string | null,
  userContent: string,
  assistantContent: string,
  userMessageId: string,
  assistantMessageId: string,
  userTimestamp: number,
  queryClient: QueryClient,
  onConversationCreated?: (id: string) => void
): Promise<void> {
  if (isNewConversation) {
    const newConversationId = await createNewConversation(userContent, assistantContent);

    if (newConversationId && onConversationCreated) {
      updateQueryCache(
        queryClient,
        newConversationId,
        userContent,
        assistantContent,
        userMessageId,
        assistantMessageId,
        userTimestamp
      );
      onConversationCreated(newConversationId);
    }
  } else if (currentConversationId) {
    await saveAssistantMessage(currentConversationId, assistantContent);
  }
}
