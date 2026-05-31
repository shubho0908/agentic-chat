import { prisma } from '@/lib/prisma';
import { SIMILARITY_THRESHOLD, CACHE_TTL_SECONDS, EMBEDDING_DIMENSIONS } from './pgvectorClient';
import { RAGError, RAGErrorCode } from '../common/errors';
import { getUserApiKey } from '@/lib/apiUtils';
import OpenAI from 'openai';
import { wrapOpenAIWithLangSmith } from '@/lib/langsmithConfig';
import { getEmbeddingModel } from '@/lib/env';
import { withRetry } from '@/lib/retry';

const EMBEDDING_MODEL = getEmbeddingModel();

function getVectorType(): string {
  return EMBEDDING_DIMENSIONS <= 2000 ? 'vector' : 'halfvec';
}

async function getOpenAIClient(userId: string): Promise<OpenAI> {
  const apiKey = await getUserApiKey(userId);
  return wrapOpenAIWithLangSmith(new OpenAI({ apiKey }));
}

export async function generateEmbedding(text: string, userId: string): Promise<number[]> {
  try {
    const client = await getOpenAIClient(userId);
    const embeddingResponse = await withRetry(
      () =>
        client.embeddings.create({
          model: EMBEDDING_MODEL,
          input: text,
        }),
      { retries: 2 }
    );

    return embeddingResponse.data[0].embedding;
  } catch (error) {
    throw new RAGError(
      `Error generating embedding: ${error instanceof Error ? error.message : String(error)}`,
      RAGErrorCode.VECTOR_STORE_FAILED,
      error
    );
  }
}

export async function searchSemanticCache(queryEmbedding: number[], userId: string, conversationId?: string): Promise<string | null> {
  try {
    const vectorType = getVectorType();
    const cutoffTimestamp = new Date(Date.now() - (CACHE_TTL_SECONDS * 1000));
    const embeddingStr = JSON.stringify(queryEmbedding);

    const results = await prisma.$queryRawUnsafe<Array<{ answer: string; score: number }>>(
      `SELECT
        answer,
        1 - (embedding <=> $1::${vectorType}) AS score
       FROM semantic_cache
       WHERE user_id = $2
         AND ($4::text IS NULL OR conversation_id = $4 OR conversation_id IS NULL)
         AND created_at > $3
       ORDER BY embedding <=> $1::${vectorType}
       LIMIT 1`,
      embeddingStr, userId, cutoffTimestamp, conversationId ?? null
    );

    if (results.length > 0 && results[0].score >= SIMILARITY_THRESHOLD) {
      return results[0].answer;
    }

    return null;
  } catch (error) {
    throw new RAGError(
      `Error searching semantic cache: ${error instanceof Error ? error.message : String(error)}`,
      RAGErrorCode.DATABASE_SEARCH_FAILED,
      error
    );
  }
}

export async function addToSemanticCache(userQuery: string, answer: string, queryEmbedding: number[], userId: string, conversationId?: string): Promise<void> {
  try {
    const vectorType = getVectorType();
    const cutoffTimestamp = new Date(Date.now() - (CACHE_TTL_SECONDS * 1000));
    const embeddingStr = JSON.stringify(queryEmbedding);

    await prisma.$executeRaw`
      DELETE FROM semantic_cache
      WHERE user_id = ${userId}
        AND created_at <= ${cutoffTimestamp}`;

    await prisma.$executeRawUnsafe(
      `INSERT INTO semantic_cache (user_id, conversation_id, question, answer, embedding)
       VALUES ($1, $2, $3, $4, $5::${vectorType})`,
      userId, conversationId ?? null, userQuery, answer, embeddingStr
    );

    await prisma.$executeRaw`
      DELETE FROM semantic_cache
      WHERE user_id = ${userId}
        AND id NOT IN (
          SELECT id FROM semantic_cache
          WHERE user_id = ${userId}
          ORDER BY created_at DESC
          LIMIT 200
        )`;
  } catch (error) {
    throw new RAGError(
      `Error adding to semantic cache: ${error instanceof Error ? error.message : String(error)}`,
      RAGErrorCode.DATABASE_INSERT_FAILED,
      error
    );
  }
}
