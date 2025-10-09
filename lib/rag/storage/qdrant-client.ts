import { QdrantClient } from "@qdrant/js-client-rest";
import { RAGError, RAGErrorCode } from '../common/errors';

interface QdrantClientConfig {
  url: string;
  checkCompatibility: boolean;
  apiKey?: string;
}

function normalizeUrl(url: string, isCloud: boolean): string {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    const protocol = isCloud || url.includes('cloud.qdrant.io') ? 'https://' : 'http://';
    return `${protocol}${url}`;
  }
  return url;
}

function createQdrantClient(): QdrantClient {
  const rawUrl = process.env.QDRANT_URL;
  
  if (!rawUrl) {
    throw new RAGError(
      'QDRANT_URL is required in environment variables',
      RAGErrorCode.QDRANT_CONFIG_ERROR
    );
  }
  
  const apiKey = process.env.QDRANT_API_KEY;
  const isCloudMode = !!(apiKey && apiKey.trim().length > 0);
  
  const url = normalizeUrl(rawUrl, isCloudMode);
  
  const config: QdrantClientConfig = {
    url,
    checkCompatibility: false,
  };

  if (isCloudMode) {
    config.apiKey = apiKey;
  }

  return new QdrantClient(config);
}

export const qdrantClient = createQdrantClient();

export function getQdrantConfig() {
  const rawUrl = process.env.QDRANT_URL;
  
  if (!rawUrl) {
    throw new RAGError(
      'QDRANT_URL is required in environment variables',
      RAGErrorCode.QDRANT_CONFIG_ERROR
    );
  }
  
  const apiKey = process.env.QDRANT_API_KEY;
  const isCloudMode = !!(apiKey && apiKey.trim().length > 0);
  
  const url = normalizeUrl(rawUrl, isCloudMode);
  
  return {
    url,
    apiKey: apiKey && apiKey.trim().length > 0 ? apiKey : undefined,
    isCloudMode,
    isLocalMode: !isCloudMode && url.includes('localhost'),
  };
}

export const SIMILARITY_THRESHOLD = 0.85;
export const CACHE_TTL_SECONDS = Number(process.env.CACHE_TTL_SECONDS as string);
export const DOCUMENTS_COLLECTION_NAME = process.env.DOCUMENTS_COLLECTION_NAME as string;