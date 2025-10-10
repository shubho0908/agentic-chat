import { getPgPool, ensurePgVectorExtension, getPgVectorVersion, EMBEDDING_DIMENSIONS } from './pgvector-client';
import { RAGError, RAGErrorCode } from '../common/errors';

/**
 * PgVector Table Initialization
 * 
 * DIMENSION HANDLING STRATEGY:
 * 
 * PostgreSQL has a fundamental 8KB page size limit:
 * - fp32 (vector): 8KB / 4 bytes = 2000 dimensions max for indexes
 * - fp16 (halfvec): 8KB / 2 bytes = 4000 dimensions max for indexes
 * 
 * SOLUTION FOR HIGH DIMENSIONS (>2000):
 * Use halfvec (half-precision floating point) storage and indexes.
 * - Supports up to 4000 dimensions
 * - Minimal accuracy loss in practice (fp16 vs fp32)
 * - Officially recommended by pgvector maintainer
 * - Requires pgvector >= 0.7.0
 * 
 * Index parameters:
 * - HNSW (<=2000 dims, fp32): m=16, ef_construction=64
 * - HNSW (2001-4000 dims, fp16): m=16, ef_construction=64
 * 
 * For embeddings >4000 dimensions, consider:
 * 1. Reduce dimensions via OpenAI API (text-embedding-3-large supports 'dimensions' parameter)
 * 2. Use binary quantization with reranking
 * 3. Sequential scans without indexes (suitable for <50k rows)
 */

let initialized = false;
let initializationPromise: Promise<void> | null = null;

const HNSW_M = 16;
const HNSW_EF_CONSTRUCTION = 64;
const FP32_MAX_DIMENSIONS = 2000; // fp32 4-byte floats: 8KB / 4 = 2000
const FP16_MAX_DIMENSIONS = 4000; // fp16 2-byte floats: 8KB / 2 = 4000
const MIN_VERSION_HALFVEC = '0.7.0'; // halfvec introduced in 0.7.0

function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);
  
  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const part1 = parts1[i] || 0;
    const part2 = parts2[i] || 0;
    if (part1 > part2) return 1;
    if (part1 < part2) return -1;
  }
  return 0;
}

function getVectorTypeAndOps(): { type: string; ops: string; indexCast: string } {
  if (EMBEDDING_DIMENSIONS <= FP32_MAX_DIMENSIONS) {
    return {
      type: `vector(${EMBEDDING_DIMENSIONS})`,
      ops: 'vector_cosine_ops',
      indexCast: ''
    };
  } else if (EMBEDDING_DIMENSIONS <= FP16_MAX_DIMENSIONS) {
    return {
      type: `halfvec(${EMBEDDING_DIMENSIONS})`,
      ops: 'halfvec_cosine_ops',
      indexCast: ''
    };
  } else {
    throw new RAGError(
      `Embedding dimensions ${EMBEDDING_DIMENSIONS} exceed maximum indexable limit (${FP16_MAX_DIMENSIONS}).\n\n`,
      RAGErrorCode.DATABASE_INIT_ERROR
    );
  }
}

async function validatePgVectorVersion(): Promise<void> {
  if (EMBEDDING_DIMENSIONS <= FP32_MAX_DIMENSIONS) {
    return;
  }

  const version = await getPgVectorVersion();
  
  if (!version) {
    throw new RAGError(
      `Could not determine pgvector version. For ${EMBEDDING_DIMENSIONS} dimensions (halfvec), pgvector >= ${MIN_VERSION_HALFVEC} is required.`,
      RAGErrorCode.DATABASE_INIT_ERROR
    );
  }

  if (compareVersions(version, MIN_VERSION_HALFVEC) < 0) {
    throw new RAGError(
      `pgvector ${version} does not support halfvec. Current embedding dimensions: ${EMBEDDING_DIMENSIONS}. `,
      RAGErrorCode.DATABASE_INIT_ERROR
    );
  }

  console.log(`[PgVector] Version ${version} validated for ${EMBEDDING_DIMENSIONS} dimensions`);
}



async function getColumnType(client: ReturnType<typeof getPgPool>, tableName: string, columnName: string): Promise<string | null> {
  try {
    const result = await client.query(
      `SELECT data_type, udt_name 
       FROM information_schema.columns 
       WHERE table_name = $1 AND column_name = $2`,
      [tableName, columnName]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    const udtName = result.rows[0].udt_name;
    if (udtName === 'vector' || udtName === 'halfvec') {
      return udtName;
    }
    
    return result.rows[0].data_type;
  } catch {
    return null;
  }
}

async function migrateColumnType(
  client: ReturnType<typeof getPgPool>,
  tableName: string,
  columnName: string,
  targetType: string
): Promise<void> {
  console.log(`[PgVector] Migrating ${tableName}.${columnName} to ${targetType}`);
  
  const indexName = `${tableName}_${columnName}_idx`;
  await client.query(`DROP INDEX IF EXISTS ${indexName}`);
  
  const countResult = await client.query(`SELECT COUNT(*) as count FROM ${tableName}`);
  const hasData = parseInt(countResult.rows[0].count) > 0;
  
  if (hasData) {
    await client.query(`ALTER TABLE ${tableName} ALTER COLUMN ${columnName} TYPE ${targetType} USING ${columnName}::${targetType}`);
  } else {
    await client.query(`ALTER TABLE ${tableName} DROP COLUMN ${columnName}`);
    await client.query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${targetType}`);
  }
}

export async function ensurePgVectorTables(): Promise<void> {
  if (initialized) {
    return;
  }

  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    try {
      const client = getPgPool();
      
      await ensurePgVectorExtension();
      await validatePgVectorVersion();

      const vectorConfig = getVectorTypeAndOps();
      const vectorType = vectorConfig.type;
      
      // Create document_chunk table (LangChain PGVectorStore compatible)
      await client.query(`
        CREATE TABLE IF NOT EXISTS document_chunk (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          content TEXT NOT NULL,
          embedding ${vectorType},
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
      `);

      // Create semantic_cache table
      await client.query(`
        CREATE TABLE IF NOT EXISTS semantic_cache (
          id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
          user_id TEXT NOT NULL,
          question TEXT NOT NULL,
          answer TEXT NOT NULL,
          embedding ${vectorType},
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
      `);

      // Create conversation_memory table
      await client.query(`
        CREATE TABLE IF NOT EXISTS conversation_memory (
          id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
          user_id TEXT NOT NULL,
          conversation_id TEXT,
          user_message TEXT NOT NULL,
          assistant_message TEXT NOT NULL,
          memory_text TEXT NOT NULL,
          embedding ${vectorType},
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
      `);

      const tables = ['document_chunk', 'semantic_cache', 'conversation_memory'];
      const expectedType = vectorType.includes('vector') ? 'vector' : vectorType.includes('halfvec') ? 'halfvec' : null;
      
      for (const tableName of tables) {
        const currentType = await getColumnType(client, tableName, 'embedding');
        if (currentType && expectedType && currentType !== expectedType) {
          await migrateColumnType(client, tableName, 'embedding', vectorType);
        }
      }

      // Create HNSW vector indexes with appropriate ops
      await client.query(`
        CREATE INDEX IF NOT EXISTS document_chunk_embedding_idx 
        ON document_chunk 
        USING hnsw (embedding ${vectorConfig.ops})
        WITH (m = ${HNSW_M}, ef_construction = ${HNSW_EF_CONSTRUCTION})
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS semantic_cache_embedding_idx 
        ON semantic_cache 
        USING hnsw (embedding ${vectorConfig.ops})
        WITH (m = ${HNSW_M}, ef_construction = ${HNSW_EF_CONSTRUCTION})
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS conversation_memory_embedding_idx 
        ON conversation_memory 
        USING hnsw (embedding ${vectorConfig.ops})
        WITH (m = ${HNSW_M}, ef_construction = ${HNSW_EF_CONSTRUCTION})
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS document_chunk_metadata_idx 
        ON document_chunk USING GIN (metadata)
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS semantic_cache_user_id_idx 
        ON semantic_cache (user_id)
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS semantic_cache_created_at_idx 
        ON semantic_cache (created_at)
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS conversation_memory_user_id_idx 
        ON conversation_memory (user_id)
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS conversation_memory_conversation_id_idx 
        ON conversation_memory (conversation_id)
      `);

      console.log(`[PgVector] All vector tables and indexes ensured using ${vectorType}`);
      initialized = true;
    } catch (error) {
      initializationPromise = null;
      throw new RAGError(
        `Error ensuring pgvector tables: ${error instanceof Error ? error.message : String(error)}`,
        RAGErrorCode.DATABASE_INIT_ERROR,
        error
      );
    }
  })();

  return initializationPromise;
}

export function resetInitialization(): void {
  initialized = false;
  initializationPromise = null;
}
