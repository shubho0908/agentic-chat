'use server';

import { PGVectorStore } from '@langchain/community/vectorstores/pgvector';
import { OpenAIEmbeddings } from '@langchain/openai';
import { ensurePgVectorTables } from '../storage/pgvector-init';
import { RAG_CONFIG } from '../config';
import { getUserApiKey } from '@/lib/api-utils';
import { rerankDocuments } from './reranker';

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
    useReranking?: boolean;
  } = {}
) {
  await ensurePgVectorTables();

  const { 
    limit = RAG_CONFIG.search.defaultLimit, 
    scoreThreshold = RAG_CONFIG.search.scoreThreshold, 
    attachmentIds, 
    conversationId,
    useReranking = true,
  } = options;

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

  const enableReranking = useReranking && RAG_CONFIG.rerank.enabled;
  
  const candidateLimit = enableReranking 
    ? limit * RAG_CONFIG.rerank.candidateMultiplier 
    : limit;

  console.log(`[RAG Search] 🔍 Retrieving ${candidateLimit} candidates (reranking: ${enableReranking ? 'enabled' : 'disabled'})`);

  const results = await vectorStore.similaritySearchWithScore(query, candidateLimit, filter);

  const filteredResults = results
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

  if (enableReranking && filteredResults.length > 0) {
    const rerankedResults = await rerankDocuments(query, filteredResults, {
      topN: limit,
    });

    console.log(`[RAG Search] ✓ Returned ${rerankedResults.length} reranked results`);
    return rerankedResults;
  }

  console.log(`[RAG Search] ✓ Returned ${Math.min(filteredResults.length, limit)} results (no reranking)`);
  return filteredResults.slice(0, limit);
}
