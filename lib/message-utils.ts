import type { Message } from './schemas/chat';

type MessageWithVersions = Message & {
  versions?: Message[];
};

interface DbAttachment {
  id?: string;
  fileUrl: string;
  fileName: string;
  fileType: string;
  fileSize: number;
}

interface DbMessage {
  id: string;
  role: string;
  content: string;
  createdAt: string | Date;
  attachments?: DbAttachment[];
  parentMessageId?: string | null;
  siblingIndex?: number;
  versions?: DbMessage[];
}

export function flattenMessageTree(messages: MessageWithVersions[]): MessageWithVersions[] {
  const result: MessageWithVersions[] = [];

  for (const msg of messages) {
    if (msg.versions && msg.versions.length > 0) {
      const versions = msg.versions;
      const latestVersion = versions[versions.length - 1];
      
      const allVersions: Message[] = [msg, ...versions].map((v, idx) => ({
        ...v,
        siblingIndex: idx,
      }));
      
      result.push({
        ...latestVersion,
        versions: allVersions,
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
