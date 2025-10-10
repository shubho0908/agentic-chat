import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { headers } from 'next/headers';
import { getAuthenticatedUser, errorResponse, jsonResponse } from '@/lib/api-utils';
import { API_ERROR_MESSAGES, HTTP_STATUS } from '@/constants/errors';
import { isValidConversationId } from '@/lib/validation';
import type { ExportConversation } from '@/lib/export/types';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, error } = await getAuthenticatedUser(await headers());
    if (error) return error;

    const { id: conversationId } = await params;

    if (!isValidConversationId(conversationId)) {
      return errorResponse(
        API_ERROR_MESSAGES.INVALID_CONVERSATION_ID,
        undefined,
        HTTP_STATUS.BAD_REQUEST
      );
    }

    const conversation = await prisma.conversation.findUnique({
      where: {
        id: conversationId,
        userId: user.id,
      },
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
        user: {
          select: {
            name: true,
            email: true,
          },
        },
        messages: {
          where: {
            parentMessageId: null,
            isDeleted: false,
          },
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
              },
            },
            versions: {
              where: {
                isDeleted: false,
              },
              orderBy: { siblingIndex: 'asc' },
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
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!conversation) {
      return errorResponse(
        API_ERROR_MESSAGES.CONVERSATION_NOT_FOUND,
        undefined,
        HTTP_STATUS.NOT_FOUND
      );
    }

    const exportData: ExportConversation = {
      id: conversation.id,
      title: conversation.title,
      createdAt: conversation.createdAt.toISOString(),
      updatedAt: conversation.updatedAt.toISOString(),
      exportedAt: new Date().toISOString(),
      version: '1.0',
      user: conversation.user,
      messages: conversation.messages.map((msg) => ({
        id: msg.id,
        role: msg.role.toLowerCase(),
        content: msg.content,
        createdAt: msg.createdAt.toISOString(),
        attachments: msg.attachments.map((att) => ({
          id: att.id,
          fileUrl: att.fileUrl,
          fileName: att.fileName,
          fileType: att.fileType,
          fileSize: att.fileSize,
        })),
        versions: msg.versions?.map((v) => ({
          id: v.id,
          role: v.role.toLowerCase(),
          content: v.content,
          createdAt: v.createdAt.toISOString(),
          attachments: v.attachments?.map((att) => ({
            id: att.id,
            fileUrl: att.fileUrl,
            fileName: att.fileName,
            fileType: att.fileType,
            fileSize: att.fileSize,
          })),
        })),
      })),
    };

    return jsonResponse(exportData);
  } catch (error) {
    return errorResponse(
      API_ERROR_MESSAGES.FAILED_FETCH_CONVERSATION,
      error instanceof Error ? error.message : undefined,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
}
