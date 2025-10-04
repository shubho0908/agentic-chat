import { QdrantClient } from "@qdrant/js-client-rest";

export const qdrantClient = new QdrantClient({ url: process.env.QDRANT_URL, apiKey: process.env.QDRANT_API });
export const SIMILARITY_THRESHOLD = 0.70;