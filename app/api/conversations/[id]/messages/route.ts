import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { headers } from 'next/headers';
import { getAuthenticatedUser, verifyConversationOwnership } from '@/lib/api-utils';
import { API_ERROR_MESSAGES, HTTP_STATUS } from '@/constants/errors';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, error } = await getAuthenticatedUser(await headers());
    if (error) return error;

    const { id: conversationId } = await params;
    const body = await request.json();
    const { role, content } = body;

    if (!role || !content) {
      return NextResponse.json(
        { error: API_ERROR_MESSAGES.MISSING_ROLE_CONTENT },
        { status: HTTP_STATUS.BAD_REQUEST }
      );
    }

    if (!['USER', 'ASSISTANT', 'SYSTEM'].includes(role)) {
      return NextResponse.json(
        { error: API_ERROR_MESSAGES.INVALID_ROLE },
        { status: HTTP_STATUS.BAD_REQUEST }
      );
    }

    const { error: convError } = await verifyConversationOwnership(conversationId, user.id);
    if (convError) return convError;

    const [message] = await prisma.$transaction([
      prisma.message.create({
        data: {
          conversationId,
          role,
          content
        }
      }),
      prisma.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() }
      })
    ]);

    return NextResponse.json(message, { status: HTTP_STATUS.CREATED });
  } catch (error) {
    console.error('Error creating message:', error);
    return NextResponse.json(
      { error: API_ERROR_MESSAGES.FAILED_CREATE_MESSAGE },
      { status: HTTP_STATUS.INTERNAL_SERVER_ERROR }
    );
  }
}
