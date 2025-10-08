import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { headers } from 'next/headers';
import { getAuthenticatedUser, verifyConversationOwnership, paginateResults, errorResponse, jsonResponse } from '@/lib/api-utils';
import { API_ERROR_MESSAGES, HTTP_STATUS } from '@/constants/errors';
import { isValidConversationId } from '@/lib/validation';
import { VALIDATION_LIMITS } from '@/constants/validation';

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
    const limit = parseInt(searchParams.get('limit') || '50');
    const cursor = searchParams.get('cursor');

    const { conversation, error: convError } = await verifyConversationOwnership(conversationId, user.id);
    if (convError) return convError;

    const messages = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      include: {
        attachments: true,
      }
    });

    const transformedMessages = messages.map(msg => ({
      ...msg,
      role: msg.role.toLowerCase(),
      attachments: msg.attachments || [],
    }));

    return jsonResponse({
      conversation: {
        id: conversation.id,
        title: conversation.title,
        isPublic: conversation.isPublic,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt
      },
      messages: paginateResults(transformedMessages, limit)
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
    const body = await request.json();
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
