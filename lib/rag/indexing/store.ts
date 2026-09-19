import { PGVectorStore } from "@langchain/community/vectorstores/pgvector";
import { OpenAIEmbeddings } from "@langchain/openai";
import type { Document } from "@langchain/core/documents";
import { getPgPool } from "../storage/pgvectorClient";
import { prisma } from "@/lib/prisma";
import { RAG_CONFIG } from "../config";
import { RAGError, RAGErrorCode } from "../common/errors";
import { getUserApiKey } from "@/lib/apiUtils";
import { withTrace } from "@/lib/langsmithConfig";

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
    tableName: "document_chunk",
    columns: {
      idColumnName: "id",
      vectorColumnName: "embedding",
      contentColumnName: "content",
      metadataColumnName: "metadata",
    },
    distanceStrategy: "cosine" as const,
  };
}

export function buildStagedDocuments(
  documents: Document[],
  params: {
    attachmentId: string;
    userId: string;
    stagingUserId: string;
    indexingRunId: string;
    fileName: string;
    conversationId: string;
    fileType?: string;
  },
): Document[] {
  return documents.map((doc, index) => ({
    ...doc,
    metadata: {
      ...doc.metadata,
      chunkId: `${params.attachmentId}:${index}`,
      attachmentId: params.attachmentId,
      userId: params.stagingUserId,
      targetUserId: params.userId,
      indexingRunId: params.indexingRunId,
      fileName: params.fileName,
      fileType: params.fileType,
      conversationId: params.conversationId,
      timestamp: new Date().toISOString(),
    },
  }));
}

export async function replaceDocumentsInPgVector(
  documents: Document[],
  attachmentId: string,
  userId: string,
  fileName: string,
  conversationId: string,
  fileType?: string,
): Promise<void> {
  const indexingRunId = crypto.randomUUID();
  const stagingUserId = `staging:${userId}:${indexingRunId}`;
  await withTrace(
    "rag-document-indexing",
    async () => {
      try {
        const docsWithMetadata = buildStagedDocuments(documents, {
          attachmentId,
          userId,
          stagingUserId,
          indexingRunId,
          fileName,
          conversationId,
          fileType,
        });
        const embeddings = await getEmbeddings(userId);
        await PGVectorStore.fromDocuments(
          docsWithMetadata,
          embeddings,
          getVectorStoreConfig(),
        );

        // The expensive embedding insert is staged under an unsearchable user id.
        // This transaction atomically swaps it into service, avoiding stale duplicates
        // as well as the empty-index window caused by delete-then-insert.
        await prisma.$transaction(async (tx) => {
          await tx.$executeRaw`
            DELETE FROM document_chunk
            WHERE metadata->>'attachmentId' = ${attachmentId}
              AND metadata->>'userId' = ${userId}`;
          await tx.$executeRaw`
            UPDATE document_chunk
            SET metadata = (metadata - 'targetUserId' - 'indexingRunId') || jsonb_build_object('userId', ${userId})
            WHERE metadata->>'attachmentId' = ${attachmentId}
              AND metadata->>'userId' = ${stagingUserId}`;
        });
      } catch (error) {
        await prisma.$executeRaw`
          DELETE FROM document_chunk
          WHERE metadata->>'attachmentId' = ${attachmentId}
            AND metadata->>'userId' = ${stagingUserId}`.catch(() => undefined);
        throw new RAGError(
          `Error replacing document chunks: ${error instanceof Error ? error.message : String(error)}`,
          RAGErrorCode.VECTOR_STORE_FAILED,
          error,
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
    },
  );
}
