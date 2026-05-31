import { PGVectorStore } from '@langchain/community/vectorstores/pgvector';
import { OpenAIEmbeddings } from '@langchain/openai';
import type { Document } from '@langchain/core/documents';
import { getPgPool } from '../storage/pgvectorClient';
import { prisma } from '@/lib/prisma';
import { RAG_CONFIG } from '../config';
import { RAGError, RAGErrorCode } from '../common/errors';
import { getUserApiKey } from '@/lib/apiUtils';
import { withTrace } from '@/lib/langsmithConfig';

async function getEmbeddings(userId: string) {
  const apiKey = await getUserApiKey(userId);
  return new OpenAIEmbeddings({
    model: RAG_CONFIG.embeddings.model,
    apiKey,
  });
}

function getVectorStoreConfig() {
  return {
    pool: getPgPool(),
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
  conversationId: string,
  fileType?: string
): Promise<void> {
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
            fileType,
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
    await prisma.$executeRaw`
      DELETE FROM document_chunk WHERE metadata->>'attachmentId' = ${attachmentId}`;
  } catch (error) {
    throw new RAGError(
      `Error deleting document chunks: ${error instanceof Error ? error.message : String(error)}`,
      RAGErrorCode.DATABASE_DELETE_FAILED,
      error
    );
  }
}
