import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { headers } from 'next/headers';
import { getAuthenticatedUser, errorResponse, jsonResponse } from '@/lib/api-utils';
import { API_ERROR_MESSAGES, HTTP_STATUS } from '@/constants/errors';
import { isValidConversationId } from '@/lib/validation';

interface BulkDeleteRequest {
  ids: string[];
}

interface BulkDeleteResponse {
  deleted: number;
  failed: string[];
}

export async function POST(request: NextRequest) {
  try {
    const { user, error } = await getAuthenticatedUser(await headers());
    if (error) return error;

    const body: BulkDeleteRequest = await request.json();
    const { ids } = body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return errorResponse(API_ERROR_MESSAGES.INVALID_CONVERSATION_IDS, undefined, HTTP_STATUS.BAD_REQUEST);
    }

    const invalidIds = ids.filter(id => !isValidConversationId(id));
    if (invalidIds.length > 0) {
      return errorResponse(API_ERROR_MESSAGES.INVALID_CONVERSATION_IDS, undefined, HTTP_STATUS.BAD_REQUEST);
    }

    const uniqueIds = Array.from(new Set(ids));
    const ownedConversations = await prisma.conversation.findMany({
      where: {
        id: { in: uniqueIds },
        userId: user.id
      },
      select: { id: true }
    });

    const ownedIdSet = new Set(ownedConversations.map(c => c.id));

    const result = await prisma.conversation.deleteMany({
      where: {
        id: { in: Array.from(ownedIdSet) },
        userId: user.id
      }
    });

    const response: BulkDeleteResponse = {
      deleted: result.count,
      failed: uniqueIds.filter(id => !ownedIdSet.has(id))
    };

    return jsonResponse(response);
  } catch (error) {
    return errorResponse(
      API_ERROR_MESSAGES.FAILED_DELETE_CONVERSATIONS,
      error instanceof Error ? error.message : undefined,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
}
