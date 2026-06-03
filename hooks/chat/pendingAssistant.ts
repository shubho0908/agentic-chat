import { MessageRole, type Message } from "@/lib/schemas/chat";

export const PENDING_ASSISTANT_PREFIX = "assistant-pending-";

export function getPendingAssistantMessageId(scope: string): string {
  return `${PENDING_ASSISTANT_PREFIX}${scope}`;
}

export function isPendingAssistantId(id?: string): boolean {
  return typeof id === "string" && id.startsWith(PENDING_ASSISTANT_PREFIX);
}

export function isPendingAssistantPlaceholder(message: Message): boolean {
  return (
    message.role === MessageRole.ASSISTANT &&
    !message.content &&
    isPendingAssistantId(message.id)
  );
}

export function dedupeMessagesById(messages: Message[]): Message[] {
  const seen = new Set<string>();
  const deduped: Message[] = [];

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.id) {
      if (seen.has(message.id)) {
        continue;
      }
      seen.add(message.id);
    }
    deduped.push(message);
  }

  return deduped.reverse();
}

export function appendMessagesDedupingIds(
  messages: Message[],
  additions: Message[],
): Message[] {
  const additionIds = new Set(
    additions
      .map((message) => message.id)
      .filter((id): id is string => typeof id === "string" && id.length > 0),
  );

  return [
    ...messages.filter((message) => !message.id || !additionIds.has(message.id)),
    ...additions,
  ];
}

export function upsertMessageById(messages: Message[], message: Message): Message[] {
  if (!message.id) {
    return [...messages, message];
  }

  let replaced = false;
  const next: Message[] = [];

  for (const current of messages) {
    if (current.id !== message.id) {
      next.push(current);
      continue;
    }

    if (!replaced) {
      next.push({ ...current, ...message });
      replaced = true;
    }
  }

  if (!replaced) {
    next.push(message);
  }

  return next;
}

export function updateMessageById(
  messages: Message[],
  messageId: string,
  updates: Partial<Message>,
): Message[] {
  let updated = false;
  const next: Message[] = [];

  for (const message of messages) {
    if (message.id !== messageId) {
      next.push(message);
      continue;
    }

    if (!updated) {
      next.push({ ...message, ...updates });
      updated = true;
    }
  }

  return updated ? next : messages;
}

export function replaceMessageId(
  messages: Message[],
  currentId: string,
  nextId: string,
  updates: Partial<Message> = {},
): Message[] {
  const targetIndex = messages.findIndex((message) => message.id === currentId);
  const fallbackIndex = targetIndex === -1
    ? messages.findIndex((message) => message.id === nextId)
    : targetIndex;

  if (fallbackIndex === -1) {
    return messages;
  }

  const next: Message[] = [];

  messages.forEach((message, index) => {
    const isCurrent = message.id === currentId;
    const isNext = message.id === nextId;

    if (index === fallbackIndex) {
      next.push({ ...message, ...updates, id: nextId });
      return;
    }

    if (isCurrent || isNext) {
      return;
    }

    next.push(message);
  });

  return next;
}
