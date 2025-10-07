import { z } from 'zod';
import { headers } from 'next/headers';
import { getAuthenticatedUser, jsonResponse, errorResponse } from '@/lib/api-utils';
import { generateEmbedding, searchSemanticCache, ensureCollection } from '@/lib/qdrant';
import { API_ERROR_MESSAGES, HTTP_STATUS } from '@/constants/errors';

const CacheCheckSchema = z.object({
  query: z.string().min(1, 'Query is required'),
});

export async function POST(req: Request) {
  try {
    const { user, error } = await getAuthenticatedUser(await headers());
    if (error) return error;

    const requestBody = await req.json();
    const parsedBody = CacheCheckSchema.safeParse(requestBody);

    if (!parsedBody.success) {
      return jsonResponse(
        { error: API_ERROR_MESSAGES.INVALID_REQUEST_BODY, details: parsedBody.error.issues },
        HTTP_STATUS.BAD_REQUEST
      );
    }

    const { query } = parsedBody.data;
    await ensureCollection(3072);

    const queryEmbedding = await generateEmbedding(query);
    const cachedResponse = await searchSemanticCache(queryEmbedding, user.id);

    if (cachedResponse) {
      return jsonResponse({ cached: true, response: cachedResponse });
    }

    return jsonResponse({ cached: false });
  } catch (error) {
    return errorResponse(
      API_ERROR_MESSAGES.CACHE_CHECK_FAILED,
      error instanceof Error ? error.message : undefined,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
}
