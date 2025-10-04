import { z } from 'zod';
import { generateEmbedding, searchSemanticCache, ensureCollection } from '@/lib/qdrant';

const CacheCheckSchema = z.object({
  query: z.string().min(1, 'Query is required'),
  userHash: z.string().min(1, 'User hash is required'),
});

export async function POST(req: Request) {
  try {
    const requestBody = await req.json();
    const parsedBody = CacheCheckSchema.safeParse(requestBody);

    if (!parsedBody.success) {
      return new Response(
        JSON.stringify({
          error: 'Invalid request body',
          details: parsedBody.error.issues
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    const { query, userHash } = parsedBody.data;

    await ensureCollection(3072);

    const queryEmbedding = await generateEmbedding(query);
    const cachedResponse = await searchSemanticCache(queryEmbedding, userHash);

    if (cachedResponse) {
      return new Response(
        JSON.stringify({
          cached: true,
          response: cachedResponse
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    return new Response(
      JSON.stringify({
        cached: false
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return new Response(
      JSON.stringify({
        error: 'Cache check failed',
        message: errorMessage
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
