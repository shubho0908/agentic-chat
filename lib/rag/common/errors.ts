
import { logger } from "@/lib/logger";
export class RAGError extends Error {
  constructor(
    message: string,
    public code: RAGErrorCode,
    public details?: unknown
  ) {
    super(message);
    this.name = 'RAGError';
  }
}

export enum RAGErrorCode {
  NOT_FOUND = 'NOT_FOUND',
  UNAUTHORIZED = 'UNAUTHORIZED',
  VECTOR_STORE_FAILED = 'VECTOR_STORE_FAILED',
  DATABASE_INIT_ERROR = 'DATABASE_INIT_ERROR',
  DATABASE_CONFIG_ERROR = 'DATABASE_CONFIG_ERROR',
  DATABASE_SEARCH_FAILED = 'DATABASE_SEARCH_FAILED',
  DATABASE_INSERT_FAILED = 'DATABASE_INSERT_FAILED',
  DATABASE_DELETE_FAILED = 'DATABASE_DELETE_FAILED',
}

export function logRAGError(error: RAGError, context: string): void {
  logger.error(`[RAG Error] ${context}`, {
    code: error.code,
    message: error.message,
    details: error.details,
  });
}
