import { Pool } from 'pg';
import { RAGError, RAGErrorCode } from '../common/errors';
import { getCacheTtlSeconds, getEmbeddingDimensions } from '@/lib/env';

let pool: Pool | null = null;

function getPgPoolMax(): number {
  const rawValue = Number(process.env.PGVECTOR_POOL_MAX ?? 10);
  if (!Number.isInteger(rawValue) || rawValue <= 0) {
    return 10;
  }
  return Math.min(rawValue, 10);
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
      max: getPgPoolMax(),
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

export const SIMILARITY_THRESHOLD = 0.85;
export const CACHE_TTL_SECONDS = getCacheTtlSeconds();
export const EMBEDDING_DIMENSIONS = getEmbeddingDimensions();
