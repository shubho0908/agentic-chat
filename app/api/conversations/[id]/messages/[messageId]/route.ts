import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { headers } from 'next/headers';
import { getAuthenticatedUser, verifyConversationOwnership, errorResponse, jsonResponse } from '@/lib/api-utils';
import { API_ERROR_MESSAGES, HTTP_STATUS } from '@/constants/errors';
import { isValidConversationId, validateAttachments } from '@/lib/validation';
import type { AttachmentInput } from '@/lib/schemas/chat';
import { messageMetadataSchema } from '@/lib/schemas/chat';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; messageId: string }> }
) {
  try {
    const { user, error } = await getAuthenticatedUser(await headers());
    if (error) return error;

    const { id: conversationId, messageId } = await params;

    if (!isValidConversationId(conversationId)) {
      return errorResponse(API_ERROR_MESSAGES.INVALID_CONVERSATION_ID, undefined, HTTP_STATUS.BAD_REQUEST);
    }

    if (!messageId || typeof messageId !== 'string') {
      return errorResponse('Invalid messageId', undefined, HTTP_STATUS.BAD_REQUEST);
    }

    const body = await request.json();
    
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return errorResponse('Invalid request body', undefined, HTTP_STATUS.BAD_REQUEST);
    }
    
    const { content, attachments, metadata } = body;

    if (!content || typeof content !== 'string') {
      return errorResponse('Invalid content', undefined, HTTP_STATUS.BAD_REQUEST);
    }

    if (metadata !== undefined && metadata !== null) {
      const metadataValidation = messageMetadataSchema.safeParse(metadata);
      if (!metadataValidation.success) {
        return errorResponse('Invalid metadata structure', metadataValidation.error.message, HTTP_STATUS.BAD_REQUEST);
      }
    }

    if (attachments !== undefined && attachments !== null) {
      const attachmentValidation = validateAttachments(attachments);
      if (!attachmentValidation.valid) {
        return errorResponse(attachmentValidation.error || 'Invalid attachments', undefined, HTTP_STATUS.BAD_REQUEST);
      }
    }

    const { error: convError } = await verifyConversationOwnership(conversationId, user.id);
    if (convError) return convError;

    const existingMessage = await prisma.message.findFirst({
      where: { 
        id: messageId,
        conversationId,
        isDeleted: false
      },
      select: { 
        conversationId: true, 
        role: true,
        parentMessageId: true,
        siblingIndex: true,
        createdAt: true
      }
    });

    if (!existingMessage) {
      return errorResponse('Message not found or already deleted', undefined, HTTP_STATUS.NOT_FOUND);
    }

    const parentId = existingMessage.parentMessageId || messageId;
    const now = new Date();
    
    const newVersion = await prisma.$transaction(async (tx) => {
      await tx.message.updateMany({
        where: {
          conversationId,
          createdAt: { gt: existingMessage.createdAt },
          isDeleted: false
        },
        data: {
          isDeleted: true,
          deletedAt: now
        }
      });

      if (existingMessage.parentMessageId) {
        await tx.message.updateMany({
          where: {
            conversationId,
            parentMessageId: existingMessage.parentMessageId,
            siblingIndex: { gt: existingMessage.siblingIndex },
            isDeleted: false
          },
          data: {
            isDeleted: true,
            deletedAt: now
          }
        });
      } else {
        await tx.message.updateMany({
          where: {
            conversationId,
            parentMessageId: messageId,
            isDeleted: false
          },
          data: {
            isDeleted: true,
            deletedAt: now
          }
        });
      }

      const maxSibling = await tx.message.aggregate({
        where: {
          OR: [
            { id: parentId },
            { parentMessageId: parentId }
          ]
        },
        _max: { siblingIndex: true }
      });

      const siblingIndex = (maxSibling._max.siblingIndex ?? -1) + 1;

      const newVersion = await tx.message.create({
        data: {
          conversationId,
          role: existingMessage.role,
          content,
          parentMessageId: parentId,
          siblingIndex,
          ...(metadata && { metadata }),
          attachments: attachments && Array.isArray(attachments) && attachments.length > 0 ? {
            create: (attachments as AttachmentInput[]).map(att => ({
              fileUrl: att.fileUrl,
              fileName: att.fileName,
              fileType: att.fileType,
              fileSize: att.fileSize,
            }))
          } : undefined,
        },
        include: {
          attachments: true,
        }
      });

      await tx.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() }
      });

      return newVersion;
    });

    return jsonResponse(newVersion, HTTP_STATUS.OK);
  } catch (error) {
    return errorResponse(
      'Failed to update message',
      error instanceof Error ? error.message : undefined,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
}
