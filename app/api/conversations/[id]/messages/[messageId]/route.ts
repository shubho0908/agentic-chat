import { NextRequest, after } from 'next/server';
import { prisma } from '@/lib/prisma';
import { headers } from 'next/headers';
import { getAuthenticatedUser, verifyConversationOwnership, errorResponse, jsonResponse } from '@/lib/apiUtils';
import { API_ERROR_MESSAGES, HTTP_STATUS } from '@/constants/errors';
import { isValidConversationId, validateAttachmentInputs } from '@/lib/validation';
import type { AttachmentInput } from '@/lib/schemas/chat';
import { messageMetadataSchema } from '@/lib/schemas/chat';
import { isSupportedForRAG } from '@/lib/rag/utils';
import { runOrQueueDocumentProcessingJob } from '@/lib/orchestration/documentJobs';


import { logger } from "@/lib/logger";
function getRagAttachmentIds(
  attachments?: Array<{ id: string; fileType: string }>
): string[] {
  if (!attachments || attachments.length === 0) {
    return [];
  }

  return attachments
    .filter((attachment) => isSupportedForRAG(attachment.fileType))
    .map((attachment) => attachment.id);
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
        logger.warn('[Message Version Route] Failed to schedule document processing:', {
          attachmentId: attachmentIds[index],
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        });
      }
    });
  });
}

function buildAttachmentCreateInput(attachments?: AttachmentInput[] | null) {
  if (!attachments || attachments.length === 0) {
    return undefined;
  }

  return {
    create: attachments.map((att) => ({
      fileUrl: att.fileUrl,
      fileName: att.fileName,
      fileType: att.fileType,
      fileSize: att.fileSize,
    })),
  };
}

async function getNextSiblingIndex(
  tx: Omit<typeof prisma, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>,
  parentId: string
) {
  const maxSibling = await tx.message.aggregate({
    where: {
      OR: [
        { id: parentId },
        { parentMessageId: parentId },
      ],
    },
    _max: { siblingIndex: true },
  });

  return (maxSibling._max.siblingIndex ?? -1) + 1;
}

async function softDeleteDownstreamBranch(
  tx: Omit<typeof prisma, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>,
  conversationId: string,
  messageId: string,
  parentMessageId: string | null,
  siblingIndex: number,
  deletedAt: Date
) {
  if (parentMessageId) {
    await tx.message.updateMany({
      where: {
        conversationId,
        parentMessageId,
        siblingIndex: { gt: siblingIndex },
        isDeleted: false,
      },
      data: {
        isDeleted: true,
        deletedAt,
      },
    });
    return;
  }

  await tx.message.updateMany({
    where: {
      conversationId,
      parentMessageId: messageId,
      isDeleted: false,
    },
    data: {
      isDeleted: true,
      deletedAt,
    },
  });
}

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

    const { content, attachments, metadata, assistantContent, assistantMessageId, assistantMetadata } = body;
    let validatedAttachments: AttachmentInput[] | undefined;

    if (!content || typeof content !== 'string') {
      return errorResponse('Invalid content', undefined, HTTP_STATUS.BAD_REQUEST);
    }

    if (metadata !== undefined && metadata !== null) {
      const metadataValidation = messageMetadataSchema.safeParse(metadata);
      if (!metadataValidation.success) {
        return errorResponse('Invalid metadata structure', metadataValidation.error.message, HTTP_STATUS.BAD_REQUEST);
      }
    }

    if (assistantMetadata !== undefined && assistantMetadata !== null) {
      const assistantMetadataValidation = messageMetadataSchema.safeParse(assistantMetadata);
      if (!assistantMetadataValidation.success) {
        return errorResponse('Invalid assistant metadata structure', assistantMetadataValidation.error.message, HTTP_STATUS.BAD_REQUEST);
      }
    }

    if (attachments !== undefined && attachments !== null) {
      const attachmentValidation = validateAttachmentInputs(attachments);
      if (!attachmentValidation.valid) {
        return errorResponse(attachmentValidation.error || 'Invalid attachments', undefined, HTTP_STATUS.BAD_REQUEST);
      }

      validatedAttachments = attachmentValidation.attachments;
    }

    if (assistantContent !== undefined && typeof assistantContent !== 'string') {
      return errorResponse('Invalid assistantContent', undefined, HTTP_STATUS.BAD_REQUEST);
    }

    if (
      assistantMessageId !== undefined &&
      assistantMessageId !== null &&
      typeof assistantMessageId !== 'string'
    ) {
      return errorResponse('Invalid assistantMessageId', undefined, HTTP_STATUS.BAD_REQUEST);
    }

    const { error: convError } = await verifyConversationOwnership(conversationId, user.id);
    if (convError) return convError;

    const existingMessage = await prisma.message.findFirst({
      where: {
        id: messageId,
        conversationId,
        isDeleted: false,
      },
      select: {
        conversationId: true,
        role: true,
        parentMessageId: true,
        siblingIndex: true,
      },
    });

    if (!existingMessage) {
      return errorResponse('Message not found or already deleted', undefined, HTTP_STATUS.NOT_FOUND);
    }

    const parentId = existingMessage.parentMessageId || messageId;
    const now = new Date();

    if (existingMessage.role === 'USER' && assistantContent) {
      const result = await prisma.$transaction(async (tx) => {
        const siblingIndex = await getNextSiblingIndex(tx, parentId);

        await softDeleteDownstreamBranch(
          tx,
          conversationId,
          messageId,
          existingMessage.parentMessageId,
          existingMessage.siblingIndex,
          now
        );

        const updatedMessage = await tx.message.create({
          data: {
            conversationId,
            role: existingMessage.role,
            content,
            parentMessageId: parentId,
            siblingIndex,
            ...(metadata && { metadata }),
            attachments: buildAttachmentCreateInput(validatedAttachments),
          },
          include: {
            attachments: true,
          },
        });

        let assistantMessage;

        if (assistantMessageId) {
          try {
            const existingAssistantMessage = await tx.message.findFirst({
              where: {
                id: assistantMessageId,
                conversationId,
                role: 'ASSISTANT',
                isDeleted: false,
              },
              select: {
                id: true,
                parentMessageId: true,
                siblingIndex: true,
              },
            });

            if (existingAssistantMessage) {
              const assistantParentId = existingAssistantMessage.parentMessageId || existingAssistantMessage.id;
              const assistantSiblingIndex = await getNextSiblingIndex(tx, assistantParentId);

              await softDeleteDownstreamBranch(
                tx,
                conversationId,
                existingAssistantMessage.id,
                existingAssistantMessage.parentMessageId,
                existingAssistantMessage.siblingIndex,
                now
              );

              assistantMessage = await tx.message.create({
                data: {
                  conversationId,
                  role: 'ASSISTANT',
                  content: assistantContent,
                  parentMessageId: assistantParentId,
                  siblingIndex: assistantSiblingIndex,
                  ...(assistantMetadata && { metadata: assistantMetadata }),
                },
                include: {
                  attachments: true,
                },
              });
            }
          } catch (assistantVersionError) {
            logger.warn('[Message Version Route] Falling back to standalone assistant message after version-link failure:', {
              assistantMessageId,
              error: assistantVersionError instanceof Error ? assistantVersionError.message : String(assistantVersionError),
            });
          }
        }

        if (!assistantMessage) {
          assistantMessage = await tx.message.create({
            data: {
              conversationId,
              role: 'ASSISTANT',
              content: assistantContent,
              ...(assistantMetadata && { metadata: assistantMetadata }),
            },
            include: {
              attachments: true,
            },
          });
        }

        await tx.conversation.update({
          where: { id: conversationId },
          data: { updatedAt: new Date() },
        });

        return {
          updatedMessage,
          assistantMessage,
        };
      });

      scheduleDocumentProcessing(getRagAttachmentIds(result.updatedMessage.attachments), user.id);

      return jsonResponse(result, HTTP_STATUS.OK);
    }

    const newVersion = await prisma.$transaction(async (tx) => {
      const siblingIndex = await getNextSiblingIndex(tx, parentId);

      await softDeleteDownstreamBranch(
        tx,
        conversationId,
        messageId,
        existingMessage.parentMessageId,
        existingMessage.siblingIndex,
        now
      );

      const createdVersion = await tx.message.create({
        data: {
          conversationId,
          role: existingMessage.role,
          content,
          parentMessageId: parentId,
          siblingIndex,
          ...(metadata && { metadata }),
          attachments: buildAttachmentCreateInput(validatedAttachments),
        },
        include: {
          attachments: true,
        },
      });

      await tx.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      });

      return createdVersion;
    });

    scheduleDocumentProcessing(getRagAttachmentIds(newVersion.attachments), user.id);

    return jsonResponse(newVersion, HTTP_STATUS.OK);
  } catch (error) {
    logger.error('[Message Version Route] Failed to update message:', error);
    return errorResponse(
      'Failed to update message',
      error instanceof Error ? error.message : undefined,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
}
