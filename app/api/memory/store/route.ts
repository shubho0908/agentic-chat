import { NextRequest } from 'next/server';
import { headers } from 'next/headers';
import { getAuthenticatedUser, jsonResponse, errorResponse } from '@/lib/api-utils';
import { API_ERROR_MESSAGES, HTTP_STATUS } from '@/constants/errors';
import { storeConversationMemory } from '@/lib/memory-conversation-context';
import { z } from 'zod';

const storeMemorySchema = z.object({
  userMessage: z.string().min(1),
  assistantMessage: z.string().min(1),
  conversationId: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const { user, error } = await getAuthenticatedUser(await headers());
    if (error) return error;

    const body = await request.json();
    const validation = storeMemorySchema.safeParse(body);

    if (!validation.success) {
      return jsonResponse(
        { error: API_ERROR_MESSAGES.INVALID_REQUEST_BODY, details: validation.error.issues },
        HTTP_STATUS.BAD_REQUEST
      );
    }

    const { userMessage, assistantMessage, conversationId } = validation.data;

    await storeConversationMemory(
      userMessage,
      assistantMessage,
      user.id,
      conversationId
    );

    return jsonResponse({ success: true, message: 'Memory stored successfully' });
  } catch (error) {
    return errorResponse(
      API_ERROR_MESSAGES.MEMORY_ADD_FAILED,
      error instanceof Error ? error.message : undefined,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
}
