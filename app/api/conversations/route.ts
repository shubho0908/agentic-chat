import { STRING_ENUM } from "@/constants/stringEnums";
import { NextRequest, after } from 'next/server';
import { prisma } from '@/lib/prisma';
import { headers } from 'next/headers';
import { getAuthenticatedUser, paginateResults, errorResponse, jsonResponse } from '@/lib/apiUtils';
import { API_ERROR_MESSAGES, HTTP_STATUS } from '@/constants/errors';
import { VALIDATION_LIMITS } from '@/constants/validation';
import { validateAttachmentInputs, validateMessageData } from '@/lib/validation';
import type { AttachmentInput } from '@/lib/schemas/chat';
import { isSupportedForRAG } from '@/lib/rag/utils';
import { runOrQueueDocumentProcessingJob } from '@/lib/orchestration/documentJobs';
import { logger } from '@/lib/logger';

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
      if (result.status === STRING_ENUM.REJECTED) {
        logger.warn('[Conversations Route] Failed to schedule document processing:', {
          attachmentId: attachmentIds[index],
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        });
      }
    });
  });
}

export async function GET(request: NextRequest) {
  try {
    const { user, error } = await getAuthenticatedUser(await headers());
    if (error) return error;

    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '20');
    const cursor = searchParams.get('cursor');

    const conversations = await prisma.conversation.findMany({
      where: { userId: user.id },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      select: {
        id: true,
        title: true,
        isPublic: true,
        createdAt: true,
        updatedAt: true,
        messages: {
          take: 1,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          select: { 
            content: true, 
            role: true,
            createdAt: true
          }
        }
      }
    });

    return jsonResponse(paginateResults(conversations, limit));
  } catch (error) {
    return errorResponse(
      API_ERROR_MESSAGES.FAILED_FETCH_CONVERSATIONS,
      error instanceof Error ? error.message : undefined,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, error } = await getAuthenticatedUser(await headers());
    if (error) return error;

    const body = await request.json();
    const { title, firstMessage } = body;

    const conversationTitle = title || 'New Chat';
    if (typeof conversationTitle === 'string' && conversationTitle.length > VALIDATION_LIMITS.CONVERSATION_TITLE_MAX_LENGTH) {
      return errorResponse(API_ERROR_MESSAGES.TITLE_TOO_LONG, undefined, HTTP_STATUS.BAD_REQUEST);
    }

    let validatedAttachments: AttachmentInput[] | undefined;

    if (firstMessage !== undefined) {
      if (!firstMessage || typeof firstMessage !== 'object' || Array.isArray(firstMessage)) {
        return errorResponse('firstMessage must be an object when provided.', undefined, HTTP_STATUS.BAD_REQUEST);
      }

      const {
        role,
        content,
        attachments,
      } = firstMessage as Record<string, unknown>;
      const messageValidation = validateMessageData(
        typeof role === 'string' ? role : undefined,
        typeof content === 'string' ? content : undefined,
      );
      if (!messageValidation.valid) {
        return errorResponse(messageValidation.error || 'Invalid message data', undefined, HTTP_STATUS.BAD_REQUEST);
      }

      if (attachments !== undefined && attachments !== null) {
        const attachmentValidation = validateAttachmentInputs(attachments);
        if (!attachmentValidation.valid) {
          return errorResponse(attachmentValidation.error || 'Invalid attachments', undefined, HTTP_STATUS.BAD_REQUEST);
        }

        validatedAttachments = attachmentValidation.attachments;
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const conversation = await tx.conversation.create({
        data: {
          userId: user.id,
          title: conversationTitle
        }
      });

      if (!firstMessage) {
        return { conversation, firstMessage: null };
      }

      const { role, content } = firstMessage as Record<string, unknown>;
      const message = await tx.message.create({
        data: {
          conversationId: conversation.id,
          role: role as 'USER' | 'ASSISTANT' | 'SYSTEM',
          content: content as string,
          attachments: validatedAttachments && validatedAttachments.length > 0 ? {
            create: validatedAttachments.map((attachment) => ({
              fileUrl: attachment.fileUrl,
              fileName: attachment.fileName,
              fileType: attachment.fileType,
              fileSize: attachment.fileSize,
            }))
          } : undefined,
        },
        include: {
          attachments: true,
        },
      });

      return { conversation, firstMessage: message };
    });

    if (result.firstMessage) {
      scheduleDocumentProcessing(getRagAttachmentIds(result.firstMessage.attachments), user.id);
    }

    return jsonResponse(
      {
        ...result.conversation,
        firstMessageId: result.firstMessage?.id,
        firstMessageAttachments: result.firstMessage?.attachments ?? [],
      },
      HTTP_STATUS.CREATED
    );
  } catch (error) {
    return errorResponse(
      API_ERROR_MESSAGES.FAILED_CREATE_CONVERSATION,
      error instanceof Error ? error.message : undefined,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
}
