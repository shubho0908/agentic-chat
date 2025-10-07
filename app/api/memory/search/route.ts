import { NextRequest } from 'next/server';
import { headers } from 'next/headers';
import { getAuthenticatedUser, jsonResponse, errorResponse } from '@/lib/api-utils';
import { API_ERROR_MESSAGES, HTTP_STATUS } from '@/constants/errors';
import { searchMemories } from '@/lib/memory-conversation-context';
import { searchMemoriesSchema } from '@/lib/schemas/memory';

export async function POST(request: NextRequest) {
  try {
    const { user, error } = await getAuthenticatedUser(await headers());
    if (error) return error;

    const body = await request.json();
    const validation = searchMemoriesSchema.safeParse(body);

    if (!validation.success) {
      return jsonResponse(
        { error: API_ERROR_MESSAGES.INVALID_REQUEST_BODY, details: validation.error.issues },
        HTTP_STATUS.BAD_REQUEST
      );
    }

    const { query, limit } = validation.data;
    const memories = await searchMemories(query, user.id, limit);

    return jsonResponse({ success: true, count: memories.length, query, memories });
  } catch (error) {
    return errorResponse(
      API_ERROR_MESSAGES.MEMORY_SEARCH_FAILED,
      error instanceof Error ? error.message : undefined,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
}
