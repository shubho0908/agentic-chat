import { type Message, type Attachment, type MessageContentPart } from "@/lib/schemas/chat";
import { QueryClient } from "@tanstack/react-query";
import { extractTextFromContent, generateTitle as generateTitleUtil } from "@/lib/content-utils";

interface UpdateMessageResponse {
  id: string;
  role: string;
  content: string;
  createdAt: string;
  conversationId: string;
  parentMessageId: string | null;
  siblingIndex: number;
  attachments: Attachment[];
}

export function generateTitle(content: string | MessageContentPart[]): string {
  return generateTitleUtil(content);
}

export async function saveUserMessage(
  conversationId: string,
  content: string | MessageContentPart[],
  attachments?: Attachment[]
): Promise<string | null> {
  try {
    const contentToSave = extractTextFromContent(content);

    const response = await fetch(`/api/conversations/${conversationId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        role: "USER",
        content: contentToSave,
        attachments: attachments || [],
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to save message: ${response.statusText}`);
    }

    const savedMessage = await response.json();
    return savedMessage.id;
  } catch (err) {
    console.error("Failed to save user message:", err);
    return null;
  }
}

export async function updateUserMessage(
  conversationId: string,
  messageId: string,
  content: string | MessageContentPart[],
  attachments?: Attachment[]
): Promise<UpdateMessageResponse> {
  try {
    const contentToSave = extractTextFromContent(content);

    const response = await fetch(`/api/conversations/${conversationId}/messages/${messageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: contentToSave,
        attachments: attachments || [],
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to update message: ${response.statusText}`);
    }

    return await response.json();
  } catch (err) {
    console.error("Failed to update user message:", err);
    throw err;
  }
}

async function saveAssistantMessage(
  conversationId: string,
  content: string
): Promise<string | null> {
  try {
    const response = await fetch(`/api/conversations/${conversationId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        role: "ASSISTANT",
        content,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to save message: ${response.statusText}`);
    }

    const savedMessage = await response.json();
    return savedMessage.id;
  } catch (err) {
    console.error("Failed to save assistant message:", err);
    return null;
  }
}

async function createNewConversation(
  userContent: string | MessageContentPart[],
  assistantContent: string,
  attachments?: Attachment[]
): Promise<{ conversationId: string; userMessageId: string; assistantMessageId: string } | null> {
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

    const userMessageId = await saveUserMessage(conversationId, userContent, attachments);
    const assistantMessageId = await saveAssistantMessage(conversationId, assistantContent);

    if (!userMessageId || !assistantMessageId) {
      return null;
    }

    return { conversationId, userMessageId, assistantMessageId };
  } catch (err) {
    console.error("Failed to create conversation:", err);
    return null;
  }
}

function updateQueryCache(
  queryClient: QueryClient,
  conversationId: string,
  userContent: string | MessageContentPart[],
  assistantContent: string,
  userMessageId: string,
  assistantMessageId: string,
  userTimestamp: number,
  attachments?: Attachment[]
): void {
  const title = generateTitle(userContent);
  const textContent = extractTextFromContent(userContent);

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
          content: textContent,
          createdAt: new Date(userTimestamp).toISOString(),
          attachments: attachments || [],
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

export function shouldUseSemanticCache(attachments?: Attachment[]): boolean {
  return !attachments || attachments.length === 0;
}

export function buildCacheQuery(
  messages: Message[], 
  newContent: string | MessageContentPart[],
  options?: { includeVersionInfo?: boolean }
): string {
  const { includeVersionInfo = true } = options || {};
  
  const textOnlyMessages = messages
    .filter(m => !m.attachments || m.attachments.length === 0)
    .slice(-4);

  const contextParts = textOnlyMessages.map(m => {
    const text = extractTextFromContent(m.content);
    const versionInfo = includeVersionInfo && m.versions && m.versions.length > 0 
      ? `[v${m.siblingIndex || 0}]` 
      : '';
    return `${m.role.toLowerCase()}${versionInfo}: ${text}`;
  });
  
  const newText = extractTextFromContent(newContent);
  contextParts.push(`user: ${newText}`);
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
  messages: Array<{ role: "user" | "assistant" | "system"; content: string | MessageContentPart[] }>,
  model: string,
  signal: AbortSignal,
  onChunk: (fullContent: string) => void,
  conversationId?: string | null
): Promise<string> {
  const response = await fetch('/api/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      conversationId: conversationId || undefined,
    }),
    signal,
  });

  if (!response.ok) {
    let errorMessage = 'Failed to send message';
    try {
      const errorData = await response.json();
      errorMessage = errorData.error || errorMessage;
    } catch {
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

          if (parsed.error) {
            throw new Error(parsed.error);
          }

          if (parsed.content) {
            fullContent += parsed.content;
            onChunk(fullContent);
          }
        } catch (err) {
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

                if (parsed.error) {
                  throw new Error(parsed.error);
                }

                if (parsed.content) {
                  fullContent += parsed.content;
                  onChunk(fullContent);
                }
              } catch (err) {
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
    reader.cancel();
    throw error;
  }

  return fullContent;
}

export function buildMessagesForAPI(
  messages: Message[],
  newContent: string | MessageContentPart[],
  systemPrompt: string
): Array<{ role: "user" | "assistant" | "system"; content: string | MessageContentPart[] }> {
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
  userContent: string | MessageContentPart[],
  assistantContent: string,
  userTimestamp: number,
  queryClient: QueryClient,
  onConversationCreated?: (data: { conversationId: string; userMessageId: string; assistantMessageId: string }) => void,
  attachments?: Attachment[]
): Promise<void> {
  if (isNewConversation) {
    const result = await createNewConversation(userContent, assistantContent, attachments);

    if (result && onConversationCreated) {
      updateQueryCache(
        queryClient,
        result.conversationId,
        userContent,
        assistantContent,
        result.userMessageId,
        result.assistantMessageId,
        userTimestamp,
        attachments
      );
      onConversationCreated(result);
    }
  } else if (currentConversationId) {
    await saveAssistantMessage(currentConversationId, assistantContent);
  }
}
