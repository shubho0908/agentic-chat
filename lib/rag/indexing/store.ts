'use server';

import { PGVectorStore } from '@langchain/community/vectorstores/pgvector';
import { OpenAIEmbeddings } from '@langchain/openai';
import type { Document } from '@langchain/core/documents';
import { ensurePgVectorTables } from '../storage/pgvector-init';
import { getPgPool } from '../storage/pgvector-client';
import { RAG_CONFIG } from '../config';
import { RAGError, RAGErrorCode } from '../common/errors';

function getEmbeddings() {
  return new OpenAIEmbeddings({
    model: RAG_CONFIG.embeddings.model,
    apiKey: RAG_CONFIG.embeddings.apiKey,
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

    await PGVectorStore.fromDocuments(
      docsWithMetadata,
      getEmbeddings(),
      getVectorStoreConfig()
    );
  } catch (error) {
    throw new RAGError(
      `Error adding documents to pgvector: ${error instanceof Error ? error.message : String(error)}`,
      RAGErrorCode.VECTOR_STORE_FAILED,
      error
    );
  }
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
