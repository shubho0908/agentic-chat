import { NextRequest } from 'next/server';
import { headers } from 'next/headers';
import { getAuthenticatedUser, verifyConversationOwnership, errorResponse, jsonResponse, parsePaginationInteger } from '@/lib/apiUtils';
import { API_ERROR_MESSAGES, HTTP_STATUS } from '@/constants/errors';
import { isValidConversationId, isValidMessageId } from '@/lib/validation';
import { getMessageVersions, getVersionCount } from '@/lib/messageVersioning';

export async function GET(
  request: NextRequest,
  context: RouteContext<"/api/conversations/[id]/messages/[messageId]/versions">
) {
  try {
    const { params } = context;
    const { user, error } = await getAuthenticatedUser(await headers());
    if (error) return error;

    const { id: conversationId, messageId } = await params;

    if (!isValidConversationId(conversationId)) {
      return errorResponse(API_ERROR_MESSAGES.INVALID_CONVERSATION_ID, undefined, HTTP_STATUS.BAD_REQUEST);
    }

    if (!isValidMessageId(messageId)) {
      return errorResponse('Invalid messageId', undefined, HTTP_STATUS.BAD_REQUEST);
    }

    const { error: convError } = await verifyConversationOwnership(conversationId, user.id);
    if (convError) return convError;

    const searchParams = request.nextUrl.searchParams;
    const includeAttachments = searchParams.get('attachments') === 'true';
    const limit = parsePaginationInteger(searchParams.get('limit'), 10);
    const offset = parsePaginationInteger(searchParams.get('offset'), 0, { min: 0 });

    const [versions, totalCount] = await Promise.all([
      getMessageVersions(conversationId, messageId, { includeAttachments, limit, offset }),
      getVersionCount(conversationId, messageId)
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
