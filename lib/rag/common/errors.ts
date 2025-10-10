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
  UNSUPPORTED_FILE_TYPE = 'UNSUPPORTED_FILE_TYPE',
  LOAD_FAILED = 'LOAD_FAILED',
  CHUNK_FAILED = 'CHUNK_FAILED',
  VECTOR_STORE_FAILED = 'VECTOR_STORE_FAILED',
  DOWNLOAD_FAILED = 'DOWNLOAD_FAILED',
  DATABASE_ERROR = 'DATABASE_ERROR',
  DATABASE_INIT_ERROR = 'DATABASE_INIT_ERROR',
  DATABASE_CONFIG_ERROR = 'DATABASE_CONFIG_ERROR',
  DATABASE_SEARCH_FAILED = 'DATABASE_SEARCH_FAILED',
  DATABASE_INSERT_FAILED = 'DATABASE_INSERT_FAILED',
  DATABASE_DELETE_FAILED = 'DATABASE_DELETE_FAILED',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  PROCESSING_FAILED = 'PROCESSING_FAILED',
}

export type RAGResult<T> = 
  | { success: true; data: T }
  | { success: false; error: RAGError };

export function toRAGResult<T>(data: T): RAGResult<T> {
  return { success: true, data };
}

export function toRAGError(error: unknown, code: RAGErrorCode, context?: string): RAGResult<never> {
  const message = error instanceof Error ? error.message : 'Unknown error';
  const fullMessage = context ? `${context}: ${message}` : message;
  
  return {
    success: false,
    error: new RAGError(fullMessage, code, error),
  };
}

export function isRAGError(error: unknown): error is RAGError {
  return error instanceof RAGError;
}

export function logRAGError(error: RAGError, context: string): void {
  console.error(`[RAG Error] ${context}`, {
    code: error.code,
    message: error.message,
    details: error.details,
  });
}
