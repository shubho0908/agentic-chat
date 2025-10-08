import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { API_ERROR_MESSAGES, HTTP_STATUS } from '@/constants/errors';
import { isValidConversationId } from '@/lib/validation';
import { errorResponse, jsonResponse } from '@/lib/api-utils';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: conversationId } = await params;

    if (!isValidConversationId(conversationId)) {
      return errorResponse(API_ERROR_MESSAGES.INVALID_CONVERSATION_ID, undefined, HTTP_STATUS.BAD_REQUEST);
    }

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
            attachments: {
              select: {
                id: true,
                fileUrl: true,
                fileName: true,
                fileType: true,
                fileSize: true,
              }
            }
          }
        }
      }
    });

    if (!conversation) {
      return errorResponse(API_ERROR_MESSAGES.CONVERSATION_NOT_FOUND, undefined, HTTP_STATUS.NOT_FOUND);
    }

    if (!conversation.isPublic) {
      return errorResponse(API_ERROR_MESSAGES.UNAUTHORIZED, undefined, HTTP_STATUS.FORBIDDEN);
    }

    const transformedConversation = {
      ...conversation,
      messages: conversation.messages.map(msg => ({
        ...msg,
        role: msg.role.toLowerCase(),
        attachments: msg.attachments || [],
      }))
    };

    return jsonResponse(transformedConversation);
  } catch (error) {
    return errorResponse(
      API_ERROR_MESSAGES.FAILED_FETCH_CONVERSATION,
      error instanceof Error ? error.message : undefined,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
}
