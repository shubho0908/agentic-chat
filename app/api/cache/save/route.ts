import { z } from 'zod';
import { generateEmbedding, addToSemanticCache, ensureCollection } from '@/lib/qdrant';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';

const CacheSaveSchema = z.object({
  query: z.string().min(1, 'Query is required'),
  response: z.string().min(1, 'Response is required'),
});

export async function POST(req: Request) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    
    if (!session?.user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const requestBody = await req.json();
    const parsedBody = CacheSaveSchema.safeParse(requestBody);

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
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return new Response(
      JSON.stringify({
        error: 'Cache save failed',
        message: errorMessage
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
