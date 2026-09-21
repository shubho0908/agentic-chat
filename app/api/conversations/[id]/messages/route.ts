import { NextRequest, after } from 'next/server';
import { prisma } from '@/lib/prisma';
import { headers } from 'next/headers';
import { getAuthenticatedUser, errorResponse, jsonResponse } from '@/lib/apiUtils';
import { API_ERROR_MESSAGES, HTTP_STATUS } from '@/constants/errors';
import { isValidConversationId, validateMessageData, validateAttachmentInputs } from '@/lib/validation';
import { messageMetadataSchema, type AttachmentInput, type MessageMetadata } from '@/lib/schemas/chat';
import { isSupportedForRAG } from '@/lib/rag/utils';
import { runOrQueueDocumentProcessingJob } from '@/lib/orchestration/documentJobs';
import { logger } from "@/lib/logger";
import { isRecord } from '@/lib/typeGuards';
import type { MessageRole, Prisma } from '@prisma/client';

type MessageWithAttachments = Prisma.MessageGetPayload<{ include: { attachments: true } }>;

function getRagAttachmentIds(
  attachments?: Array<{ id: string; fileType: string }>
): string[] {
  if (!attachments || attachments.length === 0) {
    return [];
  }

  return attachments
    .flatMap((attachment) => isSupportedForRAG(attachment.fileType) ? [attachment.id] : []);
}

function scheduleDocumentProcessing(attachmentIds: string[], userId: string): void {
  if (attachmentIds.length === 0) {
    return;
  }

  after(async () => {
    const results = await Promise.allSettled(
      attachmentIds.map((attachmentId) =>
        runOrQueueDocumentProcessingJob(attachmentId, userId)
      )
    );

    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        logger.warn('[Messages Route] Failed to schedule document processing:', {
          attachmentId: attachmentIds[index],
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        });
      }
    });
  });
}

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
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse('Request body must be valid JSON', undefined, HTTP_STATUS.BAD_REQUEST);
    }
    
    if (!isRecord(body)) {
      return errorResponse('Invalid request body', undefined, HTTP_STATUS.BAD_REQUEST);
    }
    
    const { role, content, attachments, metadata } = body;
    let validatedAttachments: AttachmentInput[] | undefined;
    let validatedMetadata: MessageMetadata | undefined;
    const roleValue = typeof role === 'string' ? role : undefined;
    const contentValue = typeof content === 'string' ? content : undefined;

    const validation = validateMessageData(roleValue, contentValue);
    if (!validation.valid) {
      return errorResponse(validation.error || 'Invalid message data', undefined, HTTP_STATUS.BAD_REQUEST);
    }

    const validatedRole = roleValue as MessageRole;
    const validatedContent = contentValue as string;

    if (metadata !== undefined && metadata !== null) {
      const metadataValidation = messageMetadataSchema.safeParse(metadata);
      if (!metadataValidation.success) {
        return errorResponse('Invalid metadata structure', metadataValidation.error.message, HTTP_STATUS.BAD_REQUEST);
      }
      validatedMetadata = metadataValidation.data;
    }

    if (attachments !== undefined && attachments !== null) {
      const attachmentValidation = validateAttachmentInputs(attachments);
      if (!attachmentValidation.valid) {
        return errorResponse(attachmentValidation.error || 'Invalid attachments', undefined, HTTP_STATUS.BAD_REQUEST);
      }

      validatedAttachments = attachmentValidation.attachments;
    }

    const clientMessageId =
      typeof body.id === 'string' && body.id.length > 0 && body.id.length <= 128
        ? body.id
        : undefined;

    try {
      await prisma.conversation.update({
        where: { id: conversationId, userId: user.id },
        data: { updatedAt: new Date() },
        select: { id: true },
      });
    } catch (updateErr) {
      if (isRecord(updateErr) && updateErr.code === "P2025") {
        return errorResponse(API_ERROR_MESSAGES.CONVERSATION_NOT_FOUND, undefined, HTTP_STATUS.NOT_FOUND);
      }
      throw updateErr;
    }

    let message: MessageWithAttachments;
    try {
      message = await prisma.message.create({
        data: {
          ...(clientMessageId && { id: clientMessageId }),
          conversationId,
          role: validatedRole,
          content: validatedContent,
          ...(validatedMetadata && { metadata: validatedMetadata }),
          attachments: validatedAttachments && validatedAttachments.length > 0 ? {
            create: validatedAttachments.map(att => ({
              fileUrl: att.fileUrl,
              fileName: att.fileName,
              fileType: att.fileType,
              fileSize: att.fileSize,
            }))
          } : undefined,
        },
        include: { attachments: true },
      });
    } catch (createErr) {
      if (isRecord(createErr) && createErr.code === "P2002" && clientMessageId) {
        const existing = await prisma.message.findUnique({
          where: { id: clientMessageId },
          include: { attachments: true },
        });
        if (existing && existing.conversationId === conversationId) {
          return jsonResponse(existing, HTTP_STATUS.OK);
        }
        return errorResponse('Message ID conflict', undefined, HTTP_STATUS.CONFLICT);
      }
      throw createErr;
    }

    scheduleDocumentProcessing(getRagAttachmentIds(message.attachments), user.id);

    return jsonResponse(message, HTTP_STATUS.CREATED);
  } catch (error) {
    return errorResponse(
      API_ERROR_MESSAGES.FAILED_CREATE_MESSAGE,
      error instanceof Error ? error.message : undefined,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
}
