import { type StreamConfig } from "./types";

export async function streamChatCompletion(config: StreamConfig): Promise<string> {
  const { messages, model, signal, onChunk, conversationId, onMemoryStatus } = config;
  
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

          if (parsed.type === 'memory_status' && onMemoryStatus) {
            onMemoryStatus({
              hasMemories: parsed.hasMemories,
              hasDocuments: parsed.hasDocuments,
              memoryCount: parsed.memoryCount,
              documentCount: parsed.documentCount || 0,
              processingDocuments: parsed.processingDocuments,
              hasImages: parsed.hasImages || false,
              imageCount: parsed.imageCount || 0,
            });
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
