import { prisma } from './prisma';
import type { Message as PrismaMessage } from './generated/prisma';

export async function getNextSiblingIndex(parentMessageId: string): Promise<number> {
  const maxSibling = await prisma.message.aggregate({
    where: {
      OR: [
        { id: parentMessageId },
        { parentMessageId: parentMessageId }
      ]
    },
    _max: {
      siblingIndex: true
    }
  });

  return (maxSibling._max.siblingIndex ?? -1) + 1;
}

export async function getMessageVersions(
  messageId: string,
  options?: { includeAttachments?: boolean; limit?: number; offset?: number }
) {
  const { includeAttachments = false, limit, offset = 0 } = options || {};

  const message = await prisma.message.findFirst({
    where: { id: messageId, isDeleted: false },
    select: { parentMessageId: true }
  });

  if (!message) return [];

  const parentId = message.parentMessageId || messageId;

  return prisma.message.findMany({
    where: {
      OR: [
        { id: parentId },
        { parentMessageId: parentId }
      ],
      isDeleted: false
    },
    include: includeAttachments ? {
      attachments: true
    } : undefined,
    orderBy: { siblingIndex: 'asc' },
    ...(limit && { take: limit }),
    ...(offset && { skip: offset })
  });
}

export async function deleteMessagesAfter(conversationId: string, messageId: string) {
  const targetMessage = await prisma.message.findFirst({
    where: { id: messageId, isDeleted: false, conversationId },
    select: { createdAt: true, parentMessageId: true, siblingIndex: true }
  });

  if (!targetMessage) {
    throw new Error('Message not found or already deleted');
  }

  const now = new Date();

  const [deleteAfterResult, deleteSiblingsResult] = await prisma.$transaction([
    prisma.message.updateMany({
      where: {
        conversationId,
        createdAt: { gt: targetMessage.createdAt },
        isDeleted: false
      },
      data: {
        isDeleted: true,
        deletedAt: now
      }
    }),
    prisma.message.updateMany({
      where: targetMessage.parentMessageId
        ? {
            conversationId,
            parentMessageId: targetMessage.parentMessageId,
            siblingIndex: { gt: targetMessage.siblingIndex },
            isDeleted: false
          }
        : {
            conversationId,
            parentMessageId: messageId,
            isDeleted: false
          },
      data: {
        isDeleted: true,
        deletedAt: now
      }
    })
  ]);

  return {
    deletedAfter: deleteAfterResult.count,
    deletedSiblings: deleteSiblingsResult.count,
    total: deleteAfterResult.count + deleteSiblingsResult.count
  };
}

export async function getVersionCount(messageId: string): Promise<number> {
  const message = await prisma.message.findFirst({
    where: { id: messageId, isDeleted: false },
    select: { parentMessageId: true }
  });

  if (!message) return 0;

  const parentId = message.parentMessageId || messageId;

  const count = await prisma.message.count({
    where: {
      OR: [
        { id: parentId },
        { parentMessageId: parentId }
      ],
      isDeleted: false
    }
  });

  return count;
}

export function buildMessageTree(messages: PrismaMessage[]) {
  const originals: PrismaMessage[] = [];
  const versionsByParent = new Map<string, PrismaMessage[]>();

  for (const msg of messages) {
    if (msg.isDeleted) continue;
    
    if (!msg.parentMessageId) {
      originals.push(msg);
    } else {
      const versions = versionsByParent.get(msg.parentMessageId) || [];
      versions.push(msg);
      versionsByParent.set(msg.parentMessageId, versions);
    }
  }

  originals.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  return originals.map(msg => ({
    ...msg,
    versions: (versionsByParent.get(msg.id) || []).sort((a, b) => a.siblingIndex - b.siblingIndex)
  }));
}
