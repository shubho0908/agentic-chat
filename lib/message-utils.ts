import type { Message, Attachment } from '@/types/core';

type MessageWithVersions = Message & {
  versions?: Message[];
};

interface DbMessage {
  id: string;
  role: string;
  content: string;
  createdAt: string | Date;
  attachments?: Attachment[];
  parentMessageId?: string | null;
  siblingIndex?: number;
  versions?: DbMessage[];
}

export function flattenMessageTree(messages: MessageWithVersions[]): MessageWithVersions[] {
  const result: MessageWithVersions[] = [];

  for (const msg of messages) {
    if (msg.versions && msg.versions.length > 0) {
      const allVersions = [msg, ...msg.versions];
      const sortedVersions = allVersions.sort((a, b) => (b.siblingIndex ?? 0) - (a.siblingIndex ?? 0));
      
      const newestVersion = sortedVersions[0];
      const olderVersions = sortedVersions.slice(1);
      
      result.push({
        ...newestVersion,
        versions: olderVersions
      });
    } else {
      result.push(msg);
    }
  }

  return result;
}

export function convertDbMessagesToFrontend(dbMessages: DbMessage[]): MessageWithVersions[] {
  return dbMessages.map(msg => {
    const convertedMsg: MessageWithVersions = {
      id: msg.id,
      role: msg.role.toLowerCase() as 'user' | 'assistant' | 'system',
      content: msg.content,
      timestamp: new Date(msg.createdAt).getTime(),
      attachments: msg.attachments || [],
      parentMessageId: msg.parentMessageId,
      siblingIndex: msg.siblingIndex,
    };

    if (msg.versions && msg.versions.length > 0) {
      convertedMsg.versions = msg.versions.map((v) => ({
        id: v.id,
        role: v.role.toLowerCase() as 'user' | 'assistant' | 'system',
        content: v.content,
        timestamp: new Date(v.createdAt).getTime(),
        attachments: v.attachments || [],
        parentMessageId: v.parentMessageId,
        siblingIndex: v.siblingIndex,
      }));
    }

    return convertedMsg;
  });
}
