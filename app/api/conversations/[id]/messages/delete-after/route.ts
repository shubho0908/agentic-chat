import { NextRequest } from 'next/server';
import { headers } from 'next/headers';
import { getAuthenticatedUser, verifyConversationOwnership, errorResponse, jsonResponse } from '@/lib/api-utils';
import { API_ERROR_MESSAGES, HTTP_STATUS } from '@/constants/errors';
import { isValidConversationId } from '@/lib/validation';
import { deleteMessagesAfter } from '@/lib/message-versioning';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, error } = await getAuthenticatedUser(await headers());
    if (error) return error;

    const { id: conversationId } = await params;

    if (!isValidConversationId(conversationId)) {
      return errorResponse(API_ERROR_MESSAGES.INVALID_CONVERSATION_ID, undefined, HTTP_STATUS.BAD_REQUEST);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return errorResponse('Invalid JSON body', undefined, HTTP_STATUS.BAD_REQUEST);
    }
    
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return errorResponse('Invalid request body', undefined, HTTP_STATUS.BAD_REQUEST);
    }
    
    let { messageId } = body;

    if (!messageId || typeof messageId !== 'string' || messageId.trim().length === 0) {
      return errorResponse('Invalid messageId', undefined, HTTP_STATUS.BAD_REQUEST);
    }
    messageId = messageId.trim();

    const { error: convError } = await verifyConversationOwnership(conversationId, user.id);
    if (convError) return convError;

    const result = await deleteMessagesAfter(conversationId, messageId);

    return jsonResponse({ 
      deleted: result.total,
      deletedAfter: result.deletedAfter,
      deletedSiblings: result.deletedSiblings,
      message: `Deleted ${result.total} message(s) (${result.deletedAfter} after, ${result.deletedSiblings} sibling versions)`
    }, HTTP_STATUS.OK);
  } catch (error) {
    return errorResponse(
      'Failed to delete messages',
      error instanceof Error ? error.message : undefined,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
}
