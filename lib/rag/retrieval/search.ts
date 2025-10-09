'use server';

import { QdrantVectorStore } from '@langchain/qdrant';
import { OpenAIEmbeddings } from '@langchain/openai';
import { ensureDocumentsCollection } from '../storage/qdrant-init';
import { RAG_CONFIG } from '../config';

function getEmbeddings() {
  return new OpenAIEmbeddings({
    model: RAG_CONFIG.embeddings.model,
    apiKey: RAG_CONFIG.embeddings.apiKey,
  });
}

export async function searchDocumentChunks(
  query: string,
  userId: string,
  options: {
    limit?: number;
    scoreThreshold?: number;
    attachmentIds?: string[];
  } = {}
) {
  await ensureDocumentsCollection();

  const { limit = RAG_CONFIG.search.defaultLimit, attachmentIds } = options;

  const filter: {
    must: Array<{
      key: string;
      match: { value?: string; any?: string[] };
    }>;
  } = {
    must: [{ key: 'metadata.userId', match: { value: userId } }],
  };

  if (attachmentIds && attachmentIds.length > 0) {
    filter.must.push({
      key: 'metadata.attachmentId',
      match: { any: attachmentIds },
    });
  }

  interface QdrantStoreConfig {
    url: string;
    collectionName: string;
    apiKey?: string;
  }

  const qdrantConfig: QdrantStoreConfig = {
    url: RAG_CONFIG.qdrant.url,
    collectionName: RAG_CONFIG.qdrant.documentsCollectionName,
  };

  if (RAG_CONFIG.qdrant.apiKey) {
    qdrantConfig.apiKey = RAG_CONFIG.qdrant.apiKey;
  }

  const vectorStore = await QdrantVectorStore.fromExistingCollection(
    getEmbeddings(),
    qdrantConfig
  );

  const results = await vectorStore.similaritySearch(query, limit, filter);

  return results.map((result) => ({
    content: result.pageContent,
    score: 1, 
    metadata: {
      attachmentId: result.metadata.attachmentId as string,
      fileName: result.metadata.fileName as string,
      page: result.metadata.loc?.pageNumber || result.metadata.page,
    },
  }));
}
