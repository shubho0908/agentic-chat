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

    let message: MessageWithAttachments;
    try {
      message = await prisma.$transaction(async (tx) => {
        await tx.conversation.update({
          where: { id: conversationId, userId: user.id },
          data: { updatedAt: new Date() },
          select: { id: true },
        });

        return tx.message.create({
          data: {
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
      });
    } catch (txErr) {
      if (txErr && typeof txErr === "object" && "code" in txErr && txErr.code === "P2025") {
        return errorResponse(API_ERROR_MESSAGES.CONVERSATION_NOT_FOUND, undefined, HTTP_STATUS.NOT_FOUND);
      }
      throw txErr;
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
