import { prisma } from './prisma';
import type { Message as PrismaMessage } from './generated/prisma';

export async function getNextSiblingIndex(parentMessageId: string): Promise<number> {
  const siblings = await prisma.message.findMany({
    where: {
      OR: [
        { id: parentMessageId },
        { parentMessageId: parentMessageId }
      ]
    },
    select: { siblingIndex: true },
    orderBy: { siblingIndex: 'desc' },
    take: 1
  });

  return siblings.length > 0 ? siblings[0].siblingIndex + 1 : 1;
}

export async function getMessageVersions(messageId: string) {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: { parentMessageId: true }
  });

  if (!message) return [];

  const parentId = message.parentMessageId || messageId;

  return prisma.message.findMany({
    where: {
      OR: [
        { id: parentId },
        { parentMessageId: parentId }
      ]
    },
    include: {
      attachments: true
    },
    orderBy: { siblingIndex: 'asc' }
  });
}

export async function deleteMessagesAfter(conversationId: string, messageId: string) {
  const targetMessage = await prisma.message.findUnique({
    where: { id: messageId },
    select: { createdAt: true, parentMessageId: true, conversationId: true }
  });

  if (!targetMessage) {
    throw new Error('Message not found');
  }

  if (targetMessage.conversationId !== conversationId) {
    throw new Error('Message does not belong to this conversation');
  }

  const [deleteAfterResult, deleteSiblingsResult] = await prisma.$transaction([
    prisma.message.deleteMany({
      where: {
        conversationId,
        createdAt: { gt: targetMessage.createdAt }
      }
    }),
    prisma.message.deleteMany({
      where: targetMessage.parentMessageId
        ? {
            conversationId,
            parentMessageId: targetMessage.parentMessageId,
            id: { not: messageId }
          }
        : {
            conversationId,
            parentMessageId: messageId
          }
    })
  ]);

  return {
    deletedAfter: deleteAfterResult.count,
    deletedSiblings: deleteSiblingsResult.count,
    total: deleteAfterResult.count + deleteSiblingsResult.count
  };
}

export function buildMessageTree(messages: PrismaMessage[]) {
  const originals: PrismaMessage[] = [];
  const versionsByParent = new Map<string, PrismaMessage[]>();

  for (const msg of messages) {
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
