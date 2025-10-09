import { getQdrantConfig } from '../storage/qdrant-client';

const qdrantConfig = getQdrantConfig();

export const RAG_CONFIG = {
  chunking: {
    defaultSize: 800,
    defaultOverlap: 100,
    separators: [
      '\n\n\n',
      '\n\n',
      '\n',
      '. ',
      '! ',
      '? ',
      '; ',
      ', ',
      ' ',
      '',
    ] as string[],
    sizeByType: {
      pdf: { size: 1000, overlap: 150 },
      doc: { size: 800, overlap: 100 },
      text: { size: 600, overlap: 80 },
    },
    adjustmentByFileSize: {
      large: { thresholdMB: 10, sizeReduction: 200, overlapReduction: 50 },
      medium: { thresholdMB: 5, sizeReduction: 100, overlapReduction: 25 },
    },
  },
  processing: {
    maxWaitTime: 30000,
    pollInterval: 500,
    exponentialBackoff: true,
    maxBackoffInterval: 2000,
  },
  search: {
    defaultLimit: 5,
    scoreThreshold: 0.7,
  },
  qdrant: {
    url: qdrantConfig.url,
    apiKey: qdrantConfig.apiKey,
    isCloudMode: qdrantConfig.isCloudMode,
    isLocalMode: qdrantConfig.isLocalMode,
    documentsCollectionName: process.env.DOCUMENTS_COLLECTION_NAME as string,
    embeddingDimensions: Number(process.env.EMBEDDING_DIMENSIONS as string),
  },
  embeddings: {
    model: process.env.EMBEDDING_MODEL as string,
    apiKey: process.env.OPENAI_API_KEY as string,
  },
  supportedFileTypes: [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'text/plain',
    'text/markdown',
  ],
};

export function validateRAGConfig(): void {
  const required = [
    'QDRANT_URL',
    'DOCUMENTS_COLLECTION_NAME',
    'EMBEDDING_DIMENSIONS',
    'EMBEDDING_MODEL',
    'OPENAI_API_KEY',
  ];

  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  if (isNaN(RAG_CONFIG.qdrant.embeddingDimensions)) {
    throw new Error('EMBEDDING_DIMENSIONS must be a valid number');
  }
}
