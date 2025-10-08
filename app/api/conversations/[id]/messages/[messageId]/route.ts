import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { headers } from 'next/headers';
import { getAuthenticatedUser, verifyConversationOwnership, errorResponse, jsonResponse } from '@/lib/api-utils';
import { API_ERROR_MESSAGES, HTTP_STATUS } from '@/constants/errors';
import { isValidConversationId, validateAttachments } from '@/lib/validation';
import type { AttachmentInput } from '@/lib/schemas/chat';
import { getNextSiblingIndex, deleteMessagesAfter } from '@/lib/message-versioning';

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
    
    const { content, attachments } = body;

    if (!content || typeof content !== 'string') {
      return errorResponse('Invalid content', undefined, HTTP_STATUS.BAD_REQUEST);
    }

    if (attachments !== undefined && attachments !== null) {
      const attachmentValidation = validateAttachments(attachments);
      if (!attachmentValidation.valid) {
        return errorResponse(attachmentValidation.error || 'Invalid attachments', undefined, HTTP_STATUS.BAD_REQUEST);
      }
    }

    const { error: convError } = await verifyConversationOwnership(conversationId, user.id);
    if (convError) return convError;

    const existingMessage = await prisma.message.findUnique({
      where: { id: messageId },
      select: { 
        conversationId: true, 
        role: true,
        parentMessageId: true 
      }
    });

    if (!existingMessage) {
      return errorResponse('Message not found', undefined, HTTP_STATUS.NOT_FOUND);
    }

    if (existingMessage.conversationId !== conversationId) {
      return errorResponse('Message does not belong to this conversation', undefined, HTTP_STATUS.BAD_REQUEST);
    }

    await deleteMessagesAfter(conversationId, messageId);

    const parentId = existingMessage.parentMessageId || messageId;
    
    const siblingIndex = await getNextSiblingIndex(parentId);

    const [newVersion] = await prisma.$transaction([
      prisma.message.create({
        data: {
          conversationId,
          role: existingMessage.role,
          content,
          parentMessageId: parentId,
          siblingIndex,
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
      }),
      prisma.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() }
      })
    ]);

    return jsonResponse(newVersion, HTTP_STATUS.OK);
  } catch (error) {
    return errorResponse(
      'Failed to update message',
      error instanceof Error ? error.message : undefined,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
}
