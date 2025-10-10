import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { headers } from 'next/headers';
import { getAuthenticatedUser, paginateResults, errorResponse, jsonResponse } from '@/lib/api-utils';
import { API_ERROR_MESSAGES, HTTP_STATUS } from '@/constants/errors';
import { VALIDATION_LIMITS } from '@/constants/validation';

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
    const { title } = body;

    const conversationTitle = title || 'New Chat';
    if (typeof conversationTitle === 'string' && conversationTitle.length > VALIDATION_LIMITS.CONVERSATION_TITLE_MAX_LENGTH) {
      return errorResponse(API_ERROR_MESSAGES.TITLE_TOO_LONG, undefined, HTTP_STATUS.BAD_REQUEST);
    }

    const conversation = await prisma.conversation.create({
      data: {
        userId: user.id,
        title: conversationTitle
      }
    });

    return jsonResponse(conversation, HTTP_STATUS.CREATED);
  } catch (error) {
    return errorResponse(
      API_ERROR_MESSAGES.FAILED_CREATE_CONVERSATION,
      error instanceof Error ? error.message : undefined,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
}
