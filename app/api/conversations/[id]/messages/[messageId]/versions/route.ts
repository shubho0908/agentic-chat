import { NextRequest } from 'next/server';
import { headers } from 'next/headers';
import { getAuthenticatedUser, verifyConversationOwnership, errorResponse, jsonResponse } from '@/lib/api-utils';
import { API_ERROR_MESSAGES, HTTP_STATUS } from '@/constants/errors';
import { isValidConversationId } from '@/lib/validation';
import { getMessageVersions, getVersionCount } from '@/lib/message-versioning';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; messageId: string }> }
) {
  try {
    const { user, error } = await getAuthenticatedUser(await headers());
    if (error) return error;

    const { id: conversationId, messageId } = await params;

    if (!isValidConversationId(conversationId)) {
      return errorResponse(API_ERROR_MESSAGES.INVALID_CONVERSATION_ID, undefined, HTTP_STATUS.BAD_REQUEST);
    }

    if (!messageId || typeof messageId !== 'string') {
      return errorResponse('Invalid messageId', undefined, HTTP_STATUS.BAD_REQUEST);
    }

    const { error: convError } = await verifyConversationOwnership(conversationId, user.id);
    if (convError) return convError;

    const searchParams = request.nextUrl.searchParams;
    const includeAttachments = searchParams.get('attachments') === 'true';
    const limit = parseInt(searchParams.get('limit') || '10');
    const offset = parseInt(searchParams.get('offset') || '0');

    const [versions, totalCount] = await Promise.all([
      getMessageVersions(messageId, { includeAttachments, limit, offset }),
      getVersionCount(messageId)
    ]);

    const transformedVersions = versions.map(v => ({
      id: v.id,
      role: v.role.toLowerCase(),
      content: v.content,
      metadata: v.metadata,
      createdAt: v.createdAt,
      siblingIndex: v.siblingIndex,
      attachments: 'attachments' in v ? v.attachments : []
    }));

    return jsonResponse({
      versions: transformedVersions,
      total: totalCount,
      hasMore: offset + versions.length < totalCount
    });
  } catch (error) {
    return errorResponse(
      'Failed to fetch versions',
      error instanceof Error ? error.message : undefined,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
}
