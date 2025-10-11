'use server';

import { PGVectorStore } from '@langchain/community/vectorstores/pgvector';
import { OpenAIEmbeddings } from '@langchain/openai';
import { ensurePgVectorTables } from '../storage/pgvector-init';
import { RAG_CONFIG } from '../config';
import { getUserApiKey } from '@/lib/api-utils';

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
    throw new Error('DATABASE_URL is required');
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

export async function searchDocumentChunks(
  query: string,
  userId: string,
  options: {
    limit?: number;
    scoreThreshold?: number;
    attachmentIds?: string[];
    conversationId?: string;
  } = {}
) {
  await ensurePgVectorTables();

  const { limit = RAG_CONFIG.search.defaultLimit, scoreThreshold = RAG_CONFIG.search.scoreThreshold, attachmentIds, conversationId } = options;

  if (!conversationId && !attachmentIds) {
    console.warn('[RAG Search] ⚠️ Neither conversationId nor attachmentIds provided. This may return documents from ALL user conversations!');
  }

  const embeddings = await getEmbeddings(userId);
  const vectorStore = new PGVectorStore(
    embeddings,
    getVectorStoreConfig()
  );
  
  await vectorStore.ensureTableInDatabase();

  const filter: Record<string, string | { $in: string[] }> = {
    userId,
  };

  if (conversationId) {
    filter.conversationId = conversationId;
  }

  if (attachmentIds && attachmentIds.length > 0) {
    filter.attachmentId = { $in: attachmentIds };
  }

  const results = await vectorStore.similaritySearchWithScore(query, limit, filter);

  return results
    .filter(([, score]) => score >= scoreThreshold)
    .map(([doc, score]) => ({
      content: doc.pageContent,
      score,
      metadata: {
        attachmentId: doc.metadata.attachmentId as string,
        fileName: doc.metadata.fileName as string,
        page: doc.metadata.loc?.pageNumber || doc.metadata.page,
      },
    }));
}
