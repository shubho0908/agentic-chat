import { NextRequest } from 'next/server';
import { headers } from 'next/headers';
import { z } from 'zod';
import { getAuthenticatedUser, jsonResponse, errorResponse } from '@/lib/api-utils';
import { API_ERROR_MESSAGES, HTTP_STATUS } from '@/constants/errors';
import { prisma } from '@/lib/prisma';
import { processDocument } from '@/lib/rag/document-processor';

const ProcessDocumentSchema = z.object({
  attachmentId: z.string().min(1, 'Attachment ID is required'),
});

export async function POST(req: NextRequest) {
  try {
    const { user, error } = await getAuthenticatedUser(await headers());
    if (error) return error;

    const requestBody = await req.json();
    const parsedBody = ProcessDocumentSchema.safeParse(requestBody);

    if (!parsedBody.success) {
      return jsonResponse(
        { error: API_ERROR_MESSAGES.INVALID_REQUEST_BODY, details: parsedBody.error.issues },
        HTTP_STATUS.BAD_REQUEST
      );
    }

    const { attachmentId } = parsedBody.data;

    const attachment = await prisma.attachment.findUnique({
      where: { id: attachmentId },
      include: {
        message: {
          include: {
            conversation: {
              select: { userId: true },
            },
          },
        },
      },
    });

    if (!attachment) {
      return jsonResponse(
        { error: 'Attachment not found' },
        HTTP_STATUS.NOT_FOUND
      );
    }

    if (attachment.message.conversation.userId !== user.id) {
      return jsonResponse(
        { error: 'Unauthorized' },
        HTTP_STATUS.FORBIDDEN
      );
    }

    const result = await processDocument(attachmentId, user.id);

    if (!result.success) {
      return jsonResponse(
        { error: result.error || 'Failed to process document' },
        HTTP_STATUS.INTERNAL_SERVER_ERROR
      );
    }

    return jsonResponse({
      success: true,
      message: 'Document processed successfully',
      attachmentId,
      stats: result.stats,
    });
  } catch (error) {
    return errorResponse(
      'Failed to process document',
      error instanceof Error ? error.message : undefined,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
}
