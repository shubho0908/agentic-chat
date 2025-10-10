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
      console.error('[PgVector] Unexpected error on idle client', err);
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
    await client.query('CREATE EXTENSION IF NOT EXISTS vector');
    const version = await getPgVectorVersion();
    console.log(`[PgVector] Extension ensured (version: ${version || 'unknown'})`);
  } catch (error) {
    throw new RAGError(
      `Error ensuring pgvector extension: ${error instanceof Error ? error.message : String(error)}`,
      RAGErrorCode.DATABASE_INIT_ERROR,
      error
    );
  }
}

export const SIMILARITY_THRESHOLD = 0.7;
export const CACHE_TTL_SECONDS = Number(process.env.CACHE_TTL_SECONDS);
export const EMBEDDING_DIMENSIONS = Number(process.env.EMBEDDING_DIMENSIONS);

export async function closePgPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
