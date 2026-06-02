import type { Message, Attachment, MessageRole } from '@/lib/schemas/chat';

type MessageWithVersions = Message & {
  versions?: Message[];
};

interface DbMessage {
  id: string;
  role: string;
  content: string;
  metadata?: Record<string, unknown>;
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
      role: msg.role.toLowerCase() as MessageRole,
      content: msg.content,
      timestamp: new Date(msg.createdAt).getTime(),
      attachments: msg.attachments || [],
      parentMessageId: msg.parentMessageId,
      siblingIndex: msg.siblingIndex,
      ...(msg.metadata && { metadata: msg.metadata }),
      ...(msg.metadata && typeof msg.metadata.thinking === 'string' ? { thinking: msg.metadata.thinking } : {}),
      ...(msg.metadata && Array.isArray(msg.metadata.toolActivities) ? { toolActivities: msg.metadata.toolActivities } : {}),
    };

    if (msg.versions && msg.versions.length > 0) {
      convertedMsg.versions = msg.versions.map((v) => ({
        id: v.id,
        role: v.role.toLowerCase() as MessageRole,
        content: v.content,
        timestamp: new Date(v.createdAt).getTime(),
        attachments: v.attachments || [],
        parentMessageId: v.parentMessageId,
        siblingIndex: v.siblingIndex,
        ...(v.metadata && { metadata: v.metadata }),
        ...(v.metadata && typeof v.metadata.thinking === 'string' ? { thinking: v.metadata.thinking } : {}),
        ...(v.metadata && Array.isArray(v.metadata.toolActivities) ? { toolActivities: v.metadata.toolActivities } : {}),
      }));
    }

    return convertedMsg;
  });
}
