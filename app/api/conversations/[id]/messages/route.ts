import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { headers } from 'next/headers';
import { getAuthenticatedUser, verifyConversationOwnership } from '@/lib/api-utils';
import { API_ERROR_MESSAGES, HTTP_STATUS } from '@/constants/errors';
import { isValidConversationId, validateMessageData } from '@/lib/validation';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, error } = await getAuthenticatedUser(await headers());
    if (error) return error;

    const { id: conversationId } = await params;

    if (!isValidConversationId(conversationId)) {
      return NextResponse.json(
        { error: API_ERROR_MESSAGES.INVALID_CONVERSATION_ID },
        { status: HTTP_STATUS.BAD_REQUEST }
      );
    }
    const body = await request.json();
    const { role, content } = body;

    const validation = validateMessageData(role, content);
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error },
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
