'use server';

import { getPgPool, SIMILARITY_THRESHOLD, CACHE_TTL_SECONDS, EMBEDDING_DIMENSIONS } from "./pgvector-client";
import { ensurePgVectorTables } from './pgvector-init';
import { RAGError, RAGErrorCode } from '../common/errors';
import { getUserApiKey } from '@/lib/api-utils';
import OpenAI from "openai";
import { wrapOpenAIWithLangSmith } from '@/lib/langsmith-config';

const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL as string;

function getVectorType(): string {
  const FP32_MAX_DIMENSIONS = 2000;

  if (EMBEDDING_DIMENSIONS <= FP32_MAX_DIMENSIONS) {
    return 'vector';
  } else {
    return 'halfvec';
  }
}

async function getOpenAIClient(userId: string): Promise<OpenAI> {
  const apiKey = await getUserApiKey(userId);
  return wrapOpenAIWithLangSmith(new OpenAI({ apiKey }));
}

export async function generateEmbedding(text: string, userId: string): Promise<number[]> {
  try {
    const client = await getOpenAIClient(userId);
    const embeddingResponse = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: text,
    });

    return embeddingResponse.data[0].embedding;
  } catch (error) {
    throw new RAGError(
      `Error generating embedding: ${error instanceof Error ? error.message : String(error)}`,
      RAGErrorCode.VECTOR_STORE_FAILED,
      error
    );
  }
}

export async function searchSemanticCache(queryEmbedding: number[], userId: string): Promise<string | null> {
  try {
    await ensurePgVectorTables();
    const pool = getPgPool();

    const vectorType = getVectorType();
    const cutoffTimestamp = new Date(Date.now() - (CACHE_TTL_SECONDS * 1000));
    const result = await pool.query(
      `SELECT
        answer,
        1 - (embedding <=> $1::${vectorType}) AS score
       FROM semantic_cache
       WHERE user_id = $2
         AND created_at > $3
       ORDER BY embedding <=> $1::${vectorType}
       LIMIT 1`,
      [JSON.stringify(queryEmbedding), userId, cutoffTimestamp]
    );

    if (result.rows.length > 0 && result.rows[0].score >= SIMILARITY_THRESHOLD) {
      return result.rows[0].answer;
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

export async function addToSemanticCache(userQuery: string, answer: string, queryEmbedding: number[], userId: string): Promise<void> {
  try {
    await ensurePgVectorTables();
    const pool = getPgPool();
    const vectorType = getVectorType();

    await pool.query(
      `INSERT INTO semantic_cache (user_id, question, answer, embedding)
       VALUES ($1, $2, $3, $4::${vectorType})`,
      [userId, userQuery, answer, JSON.stringify(queryEmbedding)]
    );
  } catch (error) {
    throw new RAGError(
      `Error adding to semantic cache: ${error instanceof Error ? error.message : String(error)}`,
      RAGErrorCode.DATABASE_INSERT_FAILED,
      error
    );
  }
}