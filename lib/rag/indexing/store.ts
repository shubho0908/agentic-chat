'use server';

import { PGVectorStore } from '@langchain/community/vectorstores/pgvector';
import { OpenAIEmbeddings } from '@langchain/openai';
import type { Document } from '@langchain/core/documents';
import { ensurePgVectorTables } from '../storage/pgvector-init';
import { getPgPool } from '../storage/pgvector-client';
import { RAG_CONFIG } from '../config';
import { RAGError, RAGErrorCode } from '../common/errors';
import { getUserApiKey } from '@/lib/api-utils';
import { withTrace } from '@/lib/langsmith-config';

async function getEmbeddings(userId: string) {
  const apiKey = await getUserApiKey(userId);
  return new OpenAIEmbeddings({
    model: RAG_CONFIG.embeddings.model,
    apiKey,
  });
}

function getVectorStoreConfig() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new RAGError('DATABASE_URL is required', RAGErrorCode.DATABASE_CONFIG_ERROR);
  }
  
  return {
    postgresConnectionOptions: {
      type: 'pg' as const,
      connectionString,
    },
    tableName: 'document_chunk',
    columns: {
      idColumnName: 'id',
      vectorColumnName: 'embedding',
      contentColumnName: 'content',
      metadataColumnName: 'metadata',
    },
    distanceStrategy: 'cosine' as const,
  };
}

export async function addDocumentsToPgVector(
  documents: Document[],
  attachmentId: string,
  userId: string,
  fileName: string,
  conversationId: string
): Promise<void> {
  await ensurePgVectorTables();

  await withTrace(
    'rag-document-indexing',
    async () => {
      try {
        const docsWithMetadata = documents.map((doc) => ({
          ...doc,
          metadata: {
            ...doc.metadata,
            attachmentId,
            userId,
            fileName,
            conversationId,
            timestamp: new Date().toISOString(),
          },
        }));

        const embeddings = await getEmbeddings(userId);
        await PGVectorStore.fromDocuments(
          docsWithMetadata,
          embeddings,
          getVectorStoreConfig()
        );
      } catch (error) {
        throw new RAGError(
          `Error adding documents to pgvector: ${error instanceof Error ? error.message : String(error)}`,
          RAGErrorCode.VECTOR_STORE_FAILED,
          error
        );
      }
    },
    {
      userId,
      attachmentId,
      fileName,
      conversationId,
      documentCount: documents.length,
      embeddingModel: RAG_CONFIG.embeddings.model,
    }
  );
}

export async function deleteDocumentChunks(attachmentId: string): Promise<void> {
  try {
    const pool = getPgPool();
    
    await pool.query(
      `DELETE FROM document_chunk WHERE metadata->>'attachmentId' = $1`,
      [attachmentId]
    );
  } catch (error) {
    throw new RAGError(
      `Error deleting document chunks: ${error instanceof Error ? error.message : String(error)}`,
      RAGErrorCode.DATABASE_DELETE_FAILED,
      error
    );
  }
}
