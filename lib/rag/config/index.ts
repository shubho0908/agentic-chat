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
      excel: { size: 1200, overlap: 150 },
      csv: { size: 1000, overlap: 120 },
      markdown: { size: 700, overlap: 100 },
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
  rerank: {
    enabled: !!process.env.COHERE_API_KEY,
    model: process.env.RERANKER_MODEL as string,
    candidateMultiplier: 4,
  },
  embeddings: {
    model: process.env.EMBEDDING_MODEL as string,
  },
  supportedFileTypes: [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/csv',
    'text/plain',
    'text/markdown',
  ],
};

import { API_ERROR_MESSAGES } from '@/constants/errors';

export function validateRAGConfig(): void {
  const required = [
    'DATABASE_URL',
    'EMBEDDING_DIMENSIONS',
    'EMBEDDING_MODEL',
  ];

  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`${API_ERROR_MESSAGES.RAG_MISSING_ENV_VARS}: ${missing.join(', ')}`);
  }

  const embeddingDimensions = Number(process.env.EMBEDDING_DIMENSIONS);
  if (isNaN(embeddingDimensions) || !Number.isInteger(embeddingDimensions) || embeddingDimensions <= 0) {
    throw new Error(API_ERROR_MESSAGES.RAG_INVALID_EMBEDDING_DIMENSIONS);
  }
}
