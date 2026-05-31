import { prisma } from './prisma';
import { VALIDATION_LIMITS } from '@/constants/validation';

function normalizeTake(limit: number | undefined): number | undefined {
  if (typeof limit !== 'number' || !Number.isSafeInteger(limit) || limit <= 0) {
    return undefined;
  }

  return Math.min(limit, VALIDATION_LIMITS.PAGINATION_MAX_LIMIT);
}

function normalizeSkip(offset: number | undefined): number | undefined {
  if (typeof offset !== 'number' || !Number.isSafeInteger(offset) || offset <= 0) {
    return undefined;
  }

  return offset;
}

export async function getMessageVersions(
  conversationId: string,
  messageId: string,
  options?: { includeAttachments?: boolean; limit?: number; offset?: number }
) {
  const { includeAttachments = false, limit, offset = 0 } = options || {};
  const take = normalizeTake(limit);
  const skip = normalizeSkip(offset);

  const message = await prisma.message.findFirst({
    where: { id: messageId, conversationId, isDeleted: false },
    select: { parentMessageId: true }
  });

  if (!message) return [];

  const parentId = message.parentMessageId || messageId;

  return prisma.message.findMany({
    where: {
      conversationId,
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
    ...(take && { take }),
    ...(skip && { skip })
  });
}

export async function deleteMessagesAfter(conversationId: string, messageId: string) {
  const targetMessage = await prisma.message.findFirst({
    where: { id: messageId, isDeleted: false, conversationId },
    select: { parentMessageId: true, siblingIndex: true }
  });

  if (!targetMessage) {
    throw new Error('Message not found or already deleted');
  }

  const now = new Date();

  const deleteSiblingsResult = await prisma.message.updateMany({
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
  });

  return {
    deletedSiblings: deleteSiblingsResult.count,
    total: deleteSiblingsResult.count
  };
}

export async function getVersionCount(conversationId: string, messageId: string): Promise<number> {
  const message = await prisma.message.findFirst({
    where: { id: messageId, conversationId, isDeleted: false },
    select: { parentMessageId: true }
  });

  if (!message) return 0;

  const parentId = message.parentMessageId || messageId;

  const count = await prisma.message.count({
    where: {
      conversationId,
      OR: [
        { id: parentId },
        { parentMessageId: parentId }
      ],
      isDeleted: false
    }
  });

  return count;
}
