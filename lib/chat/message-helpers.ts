import type { Message, MessageContent } from '@/types/core';

export function extractTextFromMessage(content: MessageContent): string {
  if (typeof content === 'string') {
    return content;
  }
  return content
    .filter((p) => p.type === 'text' && p.text)
    .map((p) => p.text)
    .join(' ');
}

export function injectContextToMessages(messages: Message[], context: string): Message[] {
  const systemMessageIndex = messages.findIndex((m) => m.role === 'system');
  
  if (systemMessageIndex >= 0) {
    const updatedMessages = [...messages];
    updatedMessages[systemMessageIndex] = {
      ...updatedMessages[systemMessageIndex],
      content: updatedMessages[systemMessageIndex].content + context
    };
    return updatedMessages;
  } else {
    return [
      { role: 'system', content: context },
      ...messages
    ];
  }
}
