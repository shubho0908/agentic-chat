import { MessageRole, type Message } from "@/lib/schemas/chat";

/**
 * Pure predicate behind the crash-resume effect in useChat: resume only when
 * the conversation visibly ended mid-turn (last message is the user's, or an
 * assistant placeholder with no content and no pending human request). A
 * persisted stream-stopped marker is a non-empty assistant message, so a
 * stopped turn never qualifies - the server marker stays the source of truth
 * after a refresh.
 */
export function shouldAutoContinueConversation(messages: Message[]): boolean {
  if (messages.length === 0) return false;

  const lastMessage = messages[messages.length - 1];
  if (
    lastMessage?.role === MessageRole.ASSISTANT &&
    lastMessage.metadata?.humanInTheLoopStatus === "pending"
  ) {
    return false;
  }

  const lastUserMessage = messages.findLast(
    (message) => message.role === MessageRole.USER,
  );

  return Boolean(
    (lastMessage?.role === MessageRole.USER && lastMessage.id) ||
      (lastMessage?.role === MessageRole.ASSISTANT &&
        !lastMessage.content &&
        !lastMessage.metadata?.humanInTheLoopRequest &&
        lastUserMessage?.id),
  );
}
