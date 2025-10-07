import { NextRequest } from 'next/server';
import { headers } from 'next/headers';
import { getAuthenticatedUser, jsonResponse, errorResponse } from '@/lib/api-utils';
import { API_ERROR_MESSAGES, HTTP_STATUS } from '@/constants/errors';
import { getAllMemories, clearMemories } from '@/lib/memory-conversation-context';

export async function GET(request: NextRequest) {
  try {
    const { user, error } = await getAuthenticatedUser(await headers());
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const memories = await getAllMemories(user.id, limit);

    return jsonResponse({ success: true, count: memories.length, memories });
  } catch (error) {
    return errorResponse(
      API_ERROR_MESSAGES.MEMORY_FETCH_FAILED,
      error instanceof Error ? error.message : undefined,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
}

export async function POST() {
  // This endpoint is deprecated. Use /api/memory/store instead.
  return jsonResponse(
    { 
      error: 'This endpoint is deprecated', 
      message: 'Use POST /api/memory/store to store conversation memories' 
    },
    HTTP_STATUS.GONE
  );
}

export async function DELETE() {
  try {
    const { user, error } = await getAuthenticatedUser(await headers());
    if (error) return error;

    await clearMemories(user.id);

    return jsonResponse({ success: true, message: 'All memories cleared successfully' });
  } catch (error) {
    return errorResponse(
      API_ERROR_MESSAGES.MEMORY_DELETE_FAILED,
      error instanceof Error ? error.message : undefined,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
}
