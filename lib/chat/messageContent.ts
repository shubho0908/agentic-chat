import type { MessageContentPart } from '@/lib/schemas/chat';

type MessageContent = string | MessageContentPart[];

export function extractTextFromMessage(content: MessageContent): string {
  if (typeof content === 'string') {
    return content;
  }

  return content
    .filter((part) => part.type === 'text')
    .map((part) => (part.type === 'text' ? part.text : ''))
    .join(' ');
}
