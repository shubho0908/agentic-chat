import { Pool } from 'pg';
import { RAGError, RAGErrorCode } from '../common/errors';

let pool: Pool | null = null;

export interface VectorSearchOptions {
  limit?: number;
  threshold?: number;
  filter?: Record<string, unknown>;
}

export interface VectorSearchResult {
  id: string;
  content: string;
  score: number;
  metadata: Record<string, unknown>;
}

export function getPgPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    
    if (!connectionString) {
      throw new RAGError(
        'DATABASE_URL is required in environment variables',
        RAGErrorCode.DATABASE_CONFIG_ERROR
      );
    }
    
    pool = new Pool({
      connectionString,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
    
    pool.on('error', (err) => {
      // Critical: Pool errors indicate DB connectivity issues
      console.error('[PgVector Pool Error]', {
        message: err.message,
        code: (err as { code?: string }).code,
        timestamp: new Date().toISOString(),
      });
    });
  }
  
  return pool;
}

export async function getPgVectorVersion(): Promise<string | null> {
  const client = getPgPool();
  
  try {
    const result = await client.query(
      `SELECT extversion FROM pg_extension WHERE extname = 'vector'`
    );
    return result.rows[0]?.extversion || null;
  } catch {
    return null;
  }
}

export async function ensurePgVectorExtension(): Promise<void> {
  const client = getPgPool();
  
  try {
    const checkResult = await client.query(
      `SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'vector') as exists`
    );
    
    if (!checkResult.rows[0].exists) {
      await client.query('CREATE EXTENSION vector');
    }
    
    await getPgVectorVersion();
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    
    if (err.code === '42501') {
      throw new RAGError(
        'Insufficient privileges to create pgvector extension. Run as superuser: CREATE EXTENSION vector;',
        RAGErrorCode.DATABASE_INIT_ERROR,
        error
      );
    }
    
    if (err.code === '58P01' || err.message?.includes('could not open extension')) {
      throw new RAGError(
        'pgvector extension not available. Install it first: https://github.com/pgvector/pgvector#installation',
        RAGErrorCode.DATABASE_INIT_ERROR,
        error
      );
    }
    
    throw new RAGError(
      `Error ensuring pgvector extension: ${err.message || String(error)}`,
      RAGErrorCode.DATABASE_INIT_ERROR,
      error
    );
  }
}

export const SIMILARITY_THRESHOLD = 0.7;
export const CACHE_TTL_SECONDS = (() => {
  const value = Number(process.env.CACHE_TTL_SECONDS);
  if (isNaN(value) || value <= 0) {
    throw new RAGError(
      'CACHE_TTL_SECONDS must be a positive number',
      RAGErrorCode.DATABASE_CONFIG_ERROR
    );
  }
  return value;
})();
export const EMBEDDING_DIMENSIONS = (() => {
  const value = Number(process.env.EMBEDDING_DIMENSIONS);
  if (isNaN(value) || !Number.isInteger(value) || value <= 0) {
    throw new RAGError(
      'EMBEDDING_DIMENSIONS must be a positive integer',
      RAGErrorCode.DATABASE_CONFIG_ERROR
    );
  }
  return value;
})();

export async function closePgPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
