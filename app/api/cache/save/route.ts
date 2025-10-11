import { z } from 'zod';
import { headers } from 'next/headers';
import { getAuthenticatedUser, jsonResponse, errorResponse } from '@/lib/api-utils';
import { generateEmbedding, addToSemanticCache } from '@/lib/rag/storage/cache';
import { API_ERROR_MESSAGES, HTTP_STATUS } from '@/constants/errors';

const CacheSaveSchema = z.object({
  query: z.string().min(1, 'Query is required'),
  response: z.string().min(1, 'Response is required'),
});

export async function POST(req: Request) {
  try {
    const { user, error } = await getAuthenticatedUser(await headers());
    if (error) return error;

    const requestBody = await req.json();
    const parsedBody = CacheSaveSchema.safeParse(requestBody);

    if (!parsedBody.success) {
      return jsonResponse(
        { error: API_ERROR_MESSAGES.INVALID_REQUEST_BODY, details: parsedBody.error.issues },
        HTTP_STATUS.BAD_REQUEST
      );
    }

    const { query, response } = parsedBody.data;

    const queryEmbedding = await generateEmbedding(query, user.id);
    await addToSemanticCache(query, response, queryEmbedding, user.id);

    return jsonResponse({ success: true, message: 'Response cached successfully' });
  } catch (error) {
    return errorResponse(
      API_ERROR_MESSAGES.CACHE_SAVE_FAILED,
      error instanceof Error ? error.message : undefined,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
}
