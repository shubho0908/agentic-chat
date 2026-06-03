import type { Message } from "@/lib/schemas/chat";
import { isPendingAssistantPlaceholder } from "./pendingAssistant";

interface ResumeConversationState {
  contextMessages: Message[];
  existingAssistantMessageId?: string;
}

export function getResumeConversationState(
  messages: Message[],
  userMessageId?: string
): ResumeConversationState {
  let userMessageIndex = -1;
  let placeholderIndex = -1;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];

    if (placeholderIndex === -1 && isPendingAssistantPlaceholder(message)) {
      placeholderIndex = index;
    }

    if (userMessageId && userMessageIndex === -1 && message.id === userMessageId) {
      userMessageIndex = index;
    }

    if (placeholderIndex !== -1 && (!userMessageId || userMessageIndex !== -1)) {
      break;
    }
  }

  const contextMessages = messages.filter((_, index) => {
    return index !== userMessageIndex && index !== placeholderIndex;
  });

  return {
    contextMessages,
    existingAssistantMessageId:
      placeholderIndex === -1 ? undefined : messages[placeholderIndex]?.id,
  };
}
