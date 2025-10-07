'use server';

import { qdrantClient, SIMILARITY_THRESHOLD, CACHE_TTL_SECONDS } from "@/constants/qdrant";
import OpenAI from "openai";

const CACHE_COLLECTION_NAME = process.env.CACHE_COLLECTION_NAME as string;
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

export async function ensureCollection(embeddingDimension: number) {
  try {
    const collections = await qdrantClient.getCollections();
    const exists = collections.collections.some(
      (c) => c.name === CACHE_COLLECTION_NAME
    );

    if (!exists) {
      await qdrantClient.createCollection(CACHE_COLLECTION_NAME, {
        vectors: {
          size: embeddingDimension,
          distance: "Cosine",
        },
      });
    }
  } catch (error) {
    console.error("Error ensuring collection:", error);
    throw error;
  }
}

export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const embeddingResponse = await getOpenAIClient().embeddings.create({
      model: EMBEDDING_MODEL,
      input: text,
    });
    return embeddingResponse.data[0].embedding;
  } catch (error) {
    console.error("Error generating embedding:", error);
    throw error;
  }
}

export async function searchSemanticCache(queryEmbedding: number[], userId: string): Promise<string | null> {
  try {
    const searchResult = await qdrantClient.search(CACHE_COLLECTION_NAME, {
      vector: queryEmbedding,
      limit: 1,
      with_payload: true,
      filter: {
        must: [
          {
            key: "userId",
            match: {
              value: userId
            }
          }
        ]
      }
    });

    if (
      searchResult.length > 0 &&
      searchResult[0].score !== undefined &&
      searchResult[0].score >= SIMILARITY_THRESHOLD
    ) {
      const timestamp = searchResult[0].payload?.timestamp as string;
      const cacheAge = (Date.now() - new Date(timestamp).getTime()) / 1000;
      
      if (cacheAge > CACHE_TTL_SECONDS) {
        return null;
      }
      
      return searchResult[0].payload?.answer as string;
    }

    return null;
  } catch (error) {
    console.error("Error searching semantic cache:", error);
    return null;
  }
}

export async function addToSemanticCache(userQuery: string, answer: string, queryEmbedding: number[], userId: string): Promise<void> {
  try {
    await qdrantClient.upsert(CACHE_COLLECTION_NAME, {
      wait: true,
      points: [
        {
          id: Date.now(),
          vector: queryEmbedding,
          payload: {
            userId: userId,
            question: userQuery,
            answer: answer,
            timestamp: new Date().toISOString()
          },
        },
      ],
    });
  } catch (error) {
    console.error("Error adding to semantic cache:", error);
  }
}