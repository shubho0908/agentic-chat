'use server';

import { prisma } from '@/lib/prisma';
import { RAGError, RAGErrorCode } from './errors';
import type { Attachment, Message, Conversation } from '@/lib/generated/prisma';

export interface AuthorizedAttachment extends Attachment {
  message: Message & {
    conversation: Pick<Conversation, 'userId'>;
  };
}

export async function getAuthorizedAttachment(
  attachmentId: string,
  userId: string
): Promise<AuthorizedAttachment> {
  const attachment = await prisma.attachment.findUnique({
    where: { id: attachmentId },
    include: {
      message: {
        include: {
          conversation: {
            select: { userId: true },
          },
        },
      },
    },
  });

  if (!attachment) {
    throw new RAGError('Attachment not found', RAGErrorCode.NOT_FOUND);
  }

  if (attachment.message.conversation.userId !== userId) {
    throw new RAGError('Unauthorized access to attachment', RAGErrorCode.UNAUTHORIZED);
  }

  return attachment as AuthorizedAttachment;
}

export async function getAuthorizedAttachments(
  attachmentIds: string[],
  userId: string
): Promise<Attachment[]> {
  const attachments = await prisma.attachment.findMany({
    where: {
      id: { in: attachmentIds },
    },
    include: {
      message: {
        include: {
          conversation: {
            select: { userId: true },
          },
        },
      },
    },
  });

  const unauthorized = attachments.filter(
    a => a.message.conversation.userId !== userId
  );

  if (unauthorized.length > 0) {
    throw new RAGError(
      `Unauthorized access to ${unauthorized.length} attachment(s)`,
      RAGErrorCode.UNAUTHORIZED
    );
  }

  return attachments;
}
