import { STRING_ENUM } from "@/constants/stringEnums";
import type { MessageContentPart } from '@/lib/schemas/chat';

type MessageContent = string | MessageContentPart[];

export function extractTextFromMessage(content: MessageContent): string {
  if (typeof content === 'string') {
    return content;
  }

  return content
    .filter((part) => part.type === STRING_ENUM.TEXT)
    .map((part) => (part.type === STRING_ENUM.TEXT ? part.text : ''))
    .join(' ');
}
