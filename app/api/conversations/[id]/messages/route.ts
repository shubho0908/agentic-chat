import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { headers } from 'next/headers';
import { getAuthenticatedUser, verifyConversationOwnership, errorResponse, jsonResponse } from '@/lib/api-utils';
import { API_ERROR_MESSAGES, HTTP_STATUS } from '@/constants/errors';
import { isValidConversationId, validateMessageData, validateAttachments } from '@/lib/validation';
import type { AttachmentInput } from '@/lib/schemas/chat';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, error } = await getAuthenticatedUser(await headers());
    if (error) return error;

    const { id: conversationId } = await params;

    if (!isValidConversationId(conversationId)) {
      return errorResponse(API_ERROR_MESSAGES.INVALID_CONVERSATION_ID, undefined, HTTP_STATUS.BAD_REQUEST);
    }
    const body = await request.json();
    const { role, content, attachments } = body;

    const validation = validateMessageData(role, content);
    if (!validation.valid) {
      return errorResponse(validation.error || 'Invalid message data', undefined, HTTP_STATUS.BAD_REQUEST);
    }

    if (attachments !== undefined && attachments !== null) {
      const attachmentValidation = validateAttachments(attachments);
      if (!attachmentValidation.valid) {
        return errorResponse(attachmentValidation.error || 'Invalid attachments', undefined, HTTP_STATUS.BAD_REQUEST);
      }
    }

    const { error: convError } = await verifyConversationOwnership(conversationId, user.id);
    if (convError) return convError;

    const [message] = await prisma.$transaction([
      prisma.message.create({
        data: {
          conversationId,
          role,
          content,
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

    return jsonResponse(message, HTTP_STATUS.CREATED);
  } catch (error) {
    return errorResponse(
      API_ERROR_MESSAGES.FAILED_CREATE_MESSAGE,
      error instanceof Error ? error.message : undefined,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
}
