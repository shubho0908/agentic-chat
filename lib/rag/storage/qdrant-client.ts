import { QdrantClient } from "@qdrant/js-client-rest";

export const qdrantClient = new QdrantClient({ 
  url: process.env.QDRANT_URL as string,
  checkCompatibility: false
});
export const SIMILARITY_THRESHOLD = 0.85;
export const CACHE_TTL_SECONDS = Number(process.env.CACHE_TTL_SECONDS as string);
export const DOCUMENTS_COLLECTION_NAME = process.env.DOCUMENTS_COLLECTION_NAME as string;