import { z } from 'zod';
import { generateEmbedding, addToSemanticCache, ensureCollection } from '@/lib/qdrant';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { API_ERROR_MESSAGES, HTTP_STATUS } from '@/constants/errors';

const CacheSaveSchema = z.object({
  query: z.string().min(1, 'Query is required'),
  response: z.string().min(1, 'Response is required'),
});

export async function POST(req: Request) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    
    if (!session?.user) {
      return new Response(
        JSON.stringify({ error: API_ERROR_MESSAGES.UNAUTHORIZED }),
        { status: HTTP_STATUS.UNAUTHORIZED, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const requestBody = await req.json();
    const parsedBody = CacheSaveSchema.safeParse(requestBody);

    if (!parsedBody.success) {
      return new Response(
        JSON.stringify({
          error: API_ERROR_MESSAGES.INVALID_REQUEST_BODY,
          details: parsedBody.error.issues
        }),
        {
          status: HTTP_STATUS.BAD_REQUEST,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    const { query, response } = parsedBody.data;

    await ensureCollection(3072);

    const queryEmbedding = await generateEmbedding(query);
    await addToSemanticCache(query, response, queryEmbedding, session.user.id);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Response cached successfully'
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : API_ERROR_MESSAGES.INTERNAL_SERVER_ERROR;
    
    return new Response(
      JSON.stringify({
        error: API_ERROR_MESSAGES.CACHE_SAVE_FAILED,
        message: errorMessage
      }),
      { status: HTTP_STATUS.INTERNAL_SERVER_ERROR, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
