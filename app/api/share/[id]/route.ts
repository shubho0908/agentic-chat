import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { API_ERROR_MESSAGES, HTTP_STATUS } from '@/constants/errors';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: conversationId } = await params;

    const conversation = await prisma.conversation.findUnique({
      where: { 
        id: conversationId,
      },
      select: {
        id: true,
        title: true,
        isPublic: true,
        createdAt: true,
        updatedAt: true,
        user: {
          select: {
            name: true,
            email: true,
          }
        },
        messages: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            role: true,
            content: true,
            createdAt: true,
          }
        }
      }
    });

    if (!conversation) {
      return NextResponse.json(
        { error: API_ERROR_MESSAGES.CONVERSATION_NOT_FOUND },
        { status: HTTP_STATUS.NOT_FOUND }
      );
    }

    if (!conversation.isPublic) {
      return NextResponse.json(
        { error: API_ERROR_MESSAGES.UNAUTHORIZED },
        { status: HTTP_STATUS.FORBIDDEN }
      );
    }

    // Transform role to lowercase for frontend compatibility
    const transformedConversation = {
      ...conversation,
      messages: conversation.messages.map(msg => ({
        ...msg,
        role: msg.role.toLowerCase()
      }))
    };

    return NextResponse.json(transformedConversation);
  } catch (error) {
    console.error('Error fetching shared conversation:', error);
    return NextResponse.json(
      { error: API_ERROR_MESSAGES.FAILED_FETCH_CONVERSATION },
      { status: HTTP_STATUS.INTERNAL_SERVER_ERROR }
    );
  }
}
