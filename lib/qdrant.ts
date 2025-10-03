import { qdrantClient, SIMILARITY_THRESHOLD } from "@/constants/qdrant";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_SECRET_KEY,
});

export async function ensureCollection(embeddingDimension: number) {
  const CACHE_COLLECTION_NAME = process.env.CACHE_COLLECTION_NAME
  try {
    const collections = await qdrantClient.getCollections();
    const exists = collections.collections.some(
      (c) => c.name === CACHE_COLLECTION_NAME
    );

    if (!exists) {
      console.log(`Creating collection "${CACHE_COLLECTION_NAME}" with dimension ${embeddingDimension}`);
      await qdrantClient.createCollection(CACHE_COLLECTION_NAME as string, {
        vectors: {
          size: embeddingDimension,
          distance: "Cosine",
        },
      });
      console.log("✅ Collection created successfully");
    } else {
      console.log("✅ Collection already exists");
    }
  } catch (error) {
    console.error("Error ensuring collection:", error);
    throw error;
  }
}

export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const embeddingResponse = await client.embeddings.create({
      model: process.env.EMBEDDING_MODEL as string,
      input: text,
    });
    return embeddingResponse.data[0].embedding;
  } catch (error) {
    console.error("Error generating embedding:", error);
    throw error;
  }
}

export async function searchSemanticCache(queryEmbedding: number[]): Promise<string | null> {
  try {
    const searchResult = await qdrantClient.search(process.env.CACHE_COLLECTION_NAME as string, {
      vector: queryEmbedding,
      limit: 1,
      with_payload: true,
    });

    if (
      searchResult.length > 0 &&
      searchResult[0].score !== undefined &&
      searchResult[0].score >= SIMILARITY_THRESHOLD
    ) {
      console.log(`✅ Cache hit (similarity: ${searchResult[0].score.toFixed(3)})`);
      return searchResult[0].payload?.answer as string;
    }

    return null;
  } catch (error) {
    console.error("Error searching semantic cache:", error);
    return null;
  }
}

export async function addToSemanticCache(userQuery: string, answer: string, queryEmbedding: number[]): Promise<void> {
  try {
    await qdrantClient.upsert(process.env.CACHE_COLLECTION_NAME as string, {
      wait: true,
      points: [
        {
          id: Date.now(),
          vector: queryEmbedding,
          payload: {
            question: userQuery,
            answer: answer,
            timestamp: new Date().toISOString()
          },
        },
      ],
    });

    console.log("💾 Added to semantic cache");
  } catch (error) {
    console.error("Error adding to semantic cache:", error);
  }
}