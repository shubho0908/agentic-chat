import { Pool } from 'pg';
import { RAGError, RAGErrorCode } from '../common/errors';
import { getCacheTtlSeconds, getEmbeddingDimensions } from '@/lib/env';
import { logger } from '@/lib/logger';

let pool: Pool | null = null;

const LANGCHAIN_POOL_MAX = 5;

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
      max: LANGCHAIN_POOL_MAX,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

    pool.on('error', (err) => {
      logger.error('[LangChain Pool Error]', {
        message: err.message,
        code: (err as { code?: string }).code,
      });
    });

    const shutdown = () => {
      pool?.end().catch(() => {});
      pool = null;
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  }

  return pool;
}

export const SIMILARITY_THRESHOLD = 0.85;
export const CACHE_TTL_SECONDS = getCacheTtlSeconds();
export const EMBEDDING_DIMENSIONS = getEmbeddingDimensions();
