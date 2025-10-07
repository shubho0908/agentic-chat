import { QdrantClient } from "@qdrant/js-client-rest";

export const qdrantClient = new QdrantClient({ 
  url: process.env.QDRANT_URL,
  checkCompatibility: false
});
export const SIMILARITY_THRESHOLD = 0.70;
export const CACHE_TTL_SECONDS = Number(process.env.CACHE_TTL_SECONDS) || 3600;