interface ConversationMessageLike {
  id: string;
  role?: string;
  createdAt: string | Date;
}

function toTimestamp(value: string | Date): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

function compareRoleTieBreak(
  left: ConversationMessageLike,
  right: ConversationMessageLike
): number {
  if (left.role === right.role) {
    return 0;
  }

  if (left.role === "assistant" && right.role === "user") {
    return -1;
  }

  if (left.role === "user" && right.role === "assistant") {
    return 1;
  }

  return 0;
}

export function compareConversationMessagesDesc(
  left: ConversationMessageLike,
  right: ConversationMessageLike
): number {
  const timestampDiff = toTimestamp(right.createdAt) - toTimestamp(left.createdAt);
  if (timestampDiff !== 0) {
    return timestampDiff;
  }

  const roleDiff = compareRoleTieBreak(left, right);
  if (roleDiff !== 0) {
    return roleDiff;
  }

  return right.id.localeCompare(left.id);
}

export function orderConversationMessagesDesc<T extends ConversationMessageLike>(messages: T[]): T[] {
  return [...messages].sort(compareConversationMessagesDesc);
}

export function orderConversationMessagesAsc<T extends ConversationMessageLike>(messages: T[]): T[] {
  return orderConversationMessagesDesc(messages).reverse();
}
