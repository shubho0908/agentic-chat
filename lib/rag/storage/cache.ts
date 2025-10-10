'use server';

import { getPgPool, SIMILARITY_THRESHOLD, CACHE_TTL_SECONDS } from "./pgvector-client";
import { ensurePgVectorTables } from './pgvector-init';
import { RAGError, RAGErrorCode } from '../common/errors';
import OpenAI from "openai";

const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL as string;

let client: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not set in environment variables');
    }
    client = new OpenAI({ apiKey });
  }
  return client;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const embeddingResponse = await getOpenAIClient().embeddings.create({
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

    const result = await pool.query(
      `SELECT 
        answer, 
        created_at,
        1 - (embedding <=> $1::vector) AS score
       FROM semantic_cache
       WHERE user_id = $2
       ORDER BY embedding <=> $1::vector
       LIMIT 1`,
      [JSON.stringify(queryEmbedding), userId]
    );

    if (result.rows.length > 0 && result.rows[0].score >= SIMILARITY_THRESHOLD) {
      const cacheAge = (Date.now() - new Date(result.rows[0].created_at).getTime()) / 1000;
      
      if (cacheAge > CACHE_TTL_SECONDS) {
        return null;
      }
      
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

    await pool.query(
      `INSERT INTO semantic_cache (user_id, question, answer, embedding)
       VALUES ($1, $2, $3, $4::vector)`,
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