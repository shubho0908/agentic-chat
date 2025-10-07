import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { API_ERROR_MESSAGES, HTTP_STATUS } from '@/constants/errors';

export async function getAuthenticatedUser(headers: Headers) {
  const session = await auth.api.getSession({ headers });
  
  if (!session?.user) {
    return { 
      user: null, 
      error: NextResponse.json(
        { error: API_ERROR_MESSAGES.UNAUTHORIZED }, 
        { status: HTTP_STATUS.UNAUTHORIZED }
      ) 
    };
  }
  
  return { user: session.user, error: null };
}

export async function verifyConversationOwnership(conversationId: string, userId: string) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, userId }
  });
  
  if (!conversation) {
    return { 
      conversation: null, 
      error: NextResponse.json(
        { error: API_ERROR_MESSAGES.CONVERSATION_NOT_FOUND }, 
        { status: HTTP_STATUS.NOT_FOUND }
      ) 
    };
  }
  
  return { conversation, error: null };
}

export function paginateResults<T extends { id: string }>(items: T[], limit: number) {
  const hasMore = items.length > limit;
  const paginatedItems = hasMore ? items.slice(0, -1) : items;
  const nextCursor = hasMore ? paginatedItems[paginatedItems.length - 1].id : null;
  
  return { items: paginatedItems, nextCursor, hasMore };
}
