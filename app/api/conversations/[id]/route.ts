import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { headers } from 'next/headers';
import { getAuthenticatedUser, verifyConversationOwnership, paginateResults, errorResponse, jsonResponse, parsePaginationInteger } from '@/lib/apiUtils';
import { API_ERROR_MESSAGES, HTTP_STATUS } from '@/constants/errors';
import { isValidConversationId, isValidMessageId } from '@/lib/validation';
import { VALIDATION_LIMITS } from '@/constants/validation';
import { calculateTokenUsage } from '@/lib/utils/tokenCounter';
import { DEFAULT_MODEL } from '@/constants/openai-models';
import type { TokenUsage } from '@/types/chat';
import type { Message } from '@/lib/schemas/chat';
import { MessageRole } from '@/lib/schemas/chat';
import type { Prisma } from '@prisma/client';
import { logger } from "@/lib/logger";
import { isRecord } from '@/lib/typeGuards';

interface MessageAttachment {
  id: string;
  fileUrl: string;
  fileName: string;
  fileType: string;
  fileSize: number;
}

interface BaseMessage {
  id: string;
  role: string;
  content: string;
  metadata?: Prisma.JsonValue;
  createdAt: Date;
  siblingIndex: number;
  parentMessageId: string | null;
  attachments?: MessageAttachment[];
}

interface MessageWithAttachments extends BaseMessage {
  conversationId: string;
  versions?: VersionMessage[];
}

type VersionMessage = BaseMessage;

function toChatMessageForTokenUsage(message: { role: string; content: string; attachments?: MessageAttachment[] }): Message {
  const normalizedRole = message.role.toLowerCase();
  const role: Message['role'] =
    (Object.values(MessageRole) as string[]).includes(normalizedRole)
      ? (normalizedRole as Message['role'])
      : MessageRole.ASSISTANT;

  return {
    role,
    content: message.content,
    attachments: message.attachments,
  };
}

export async function GET(
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
    const searchParams = request.nextUrl.searchParams;
    const limit = parsePaginationInteger(searchParams.get('limit'), 50);
    const cursor = searchParams.get('cursor');

    if (cursor && !isValidMessageId(cursor)) {
      return errorResponse('Invalid cursor', undefined, HTTP_STATUS.BAD_REQUEST);
    }

    const { conversation, error: convError } = await verifyConversationOwnership(conversationId, user.id);
    if (convError) return convError;

    const includeAttachments = searchParams.get('attachments') !== 'false';
    const includeVersions = searchParams.get('versions') === 'true';

    const originalMessages = await prisma.message.findMany({
      where: {
        conversationId,
        parentMessageId: null,
        isDeleted: false
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      select: {
        id: true,
        role: true,
        content: true,
        metadata: true,
        createdAt: true,
        conversationId: true,
        parentMessageId: true,
        siblingIndex: true,
        ...(includeAttachments && {
          attachments: {
            select: {
              id: true,
              fileUrl: true,
              fileName: true,
              fileType: true,
              fileSize: true
            }
          }
        })
      }
    });

    const messageIds = originalMessages.slice(0, Math.min(originalMessages.length, limit)).map(m => m.id);

    const versionCounts = messageIds.length > 0 ? await prisma.message.groupBy({
      by: ['parentMessageId'],
      where: {
        conversationId,
        parentMessageId: { in: messageIds },
        isDeleted: false
      },
      _count: true
    }) : [];

    const versionCountMap = new Map(
      versionCounts.map(vc => [vc.parentMessageId!, vc._count])
    );

    const versionsByParent = new Map<string, VersionMessage[]>();

    if (includeVersions && messageIds.length > 0) {
      const versions = await prisma.message.findMany({
        where: {
          conversationId,
          parentMessageId: { in: messageIds },
          isDeleted: false
        },
        select: {
          id: true,
          role: true,
          content: true,
          metadata: true,
          createdAt: true,
          siblingIndex: true,
          parentMessageId: true,
          ...(includeAttachments && {
            attachments: {
              select: {
                id: true,
                fileUrl: true,
                fileName: true,
                fileType: true,
                fileSize: true
              }
            }
          })
        },
        orderBy: { siblingIndex: 'asc' }
      });

      for (const version of versions) {
        if (!version.parentMessageId) continue;
        const existing = versionsByParent.get(version.parentMessageId) || [];
        existing.push(version);
        versionsByParent.set(version.parentMessageId, existing);
      }
    }

    const paginatedTree = originalMessages.slice(0, limit).map(msg => ({
      ...msg,
      versionCount: (versionCountMap.get(msg.id) || 0) + 1,
      ...(includeVersions && { versions: versionsByParent.get(msg.id) || [] })
    }));

    const transformedMessages = paginatedTree.map(msg => {
      const msgWithAttachments = msg as MessageWithAttachments & { versionCount?: number };
      return {
        ...msgWithAttachments,
        role: msgWithAttachments.role.toLowerCase(),
        attachments: includeAttachments ? (msgWithAttachments.attachments || []) : undefined,
        versionCount: msgWithAttachments.versionCount,
        ...(includeVersions && {
          versions: msgWithAttachments.versions?.map(v => ({
            ...v,
            role: v.role.toLowerCase(),
            attachments: includeAttachments ? (v.attachments || []) : undefined
          })) || []
        })
      };
    });

    let tokenUsage: TokenUsage | undefined;
    try {
      const model = searchParams.get('model') ?? DEFAULT_MODEL;
      tokenUsage = calculateTokenUsage(transformedMessages.map(toChatMessageForTokenUsage), model);
    } catch (error) {
      logger.error('[Token Calculation Error]', error);
    }

    return jsonResponse({
      conversation: {
        id: conversation.id,
        title: conversation.title,
        isPublic: conversation.isPublic,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt
      },
      messages: paginateResults(transformedMessages, limit),
      ...(tokenUsage && { tokenUsage })
    });
  } catch (error) {
    return errorResponse(
      API_ERROR_MESSAGES.FAILED_FETCH_CONVERSATION,
      error instanceof Error ? error.message : undefined,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
}

export async function PATCH(
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
      return errorResponse(API_ERROR_MESSAGES.INVALID_REQUEST_BODY, undefined, HTTP_STATUS.BAD_REQUEST);
    }

    const { title, isPublic } = body;

    if (title === undefined && isPublic === undefined) {
      return errorResponse(API_ERROR_MESSAGES.INVALID_REQUEST_BODY, undefined, HTTP_STATUS.BAD_REQUEST);
    }

    const updateData: { title?: string; isPublic?: boolean } = {};
    if (title !== undefined) {
      if (typeof title !== 'string' || !title.trim()) {
        return errorResponse(API_ERROR_MESSAGES.TITLE_REQUIRED, undefined, HTTP_STATUS.BAD_REQUEST);
      }
      const trimmedTitle = title.trim();
      if (trimmedTitle.length > VALIDATION_LIMITS.CONVERSATION_TITLE_MAX_LENGTH) {
        return errorResponse(API_ERROR_MESSAGES.TITLE_TOO_LONG, undefined, HTTP_STATUS.BAD_REQUEST);
      }
      updateData.title = trimmedTitle;
    }
    if (isPublic !== undefined) {
      if (typeof isPublic !== 'boolean') {
        return errorResponse(API_ERROR_MESSAGES.INVALID_REQUEST_BODY, undefined, HTTP_STATUS.BAD_REQUEST);
      }
      updateData.isPublic = isPublic;
    }

    const updatedConversation = await prisma.conversation.update({
      where: {
        id: conversationId,
        userId: user.id
      },
      data: updateData,
      select: {
        id: true,
        title: true,
        isPublic: true,
        createdAt: true,
        updatedAt: true
      }
    });

    return jsonResponse(updatedConversation);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2025') {
      return errorResponse(API_ERROR_MESSAGES.CONVERSATION_NOT_FOUND, undefined, HTTP_STATUS.NOT_FOUND);
    }

    return errorResponse(
      API_ERROR_MESSAGES.FAILED_UPDATE_CONVERSATION,
      error instanceof Error ? error.message : undefined,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, error } = await getAuthenticatedUser(await headers());
    if (error) return error;

    const { id: conversationId } = await params;

    if (!isValidConversationId(conversationId)) {
      return errorResponse(API_ERROR_MESSAGES.INVALID_CONVERSATION_ID, undefined, HTTP_STATUS.BAD_REQUEST);
    }

    const conversation = await prisma.conversation.deleteMany({
      where: {
        id: conversationId,
        userId: user.id
      }
    });

    if (conversation.count === 0) {
      return errorResponse(API_ERROR_MESSAGES.CONVERSATION_NOT_FOUND, undefined, HTTP_STATUS.NOT_FOUND);
    }

    return jsonResponse({ success: true });
  } catch (error) {
    return errorResponse(
      API_ERROR_MESSAGES.FAILED_DELETE_CONVERSATION,
      error instanceof Error ? error.message : undefined,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
}
