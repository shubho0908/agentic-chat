'use server';

import { QdrantVectorStore } from '@langchain/qdrant';
import { OpenAIEmbeddings } from '@langchain/openai';
import type { Document } from '@langchain/core/documents';
import { ensureDocumentsCollection } from './qdrant-init';
import { RAG_CONFIG } from './config';

function getEmbeddings() {
  return new OpenAIEmbeddings({
    model: RAG_CONFIG.embeddings.model,
    apiKey: RAG_CONFIG.embeddings.apiKey,
  });
}

export async function addDocumentsToQdrant(
  documents: Document[],
  attachmentId: string,
  userId: string,
  fileName: string
): Promise<void> {
  await ensureDocumentsCollection();

  const docsWithMetadata = documents.map((doc) => ({
    ...doc,
    metadata: {
      ...doc.metadata,
      userId,
      attachmentId,
      fileName,
      timestamp: new Date().toISOString(),
    },
  }));

  await QdrantVectorStore.fromDocuments(
    docsWithMetadata,
    getEmbeddings(),
    {
      url: RAG_CONFIG.qdrant.url,
      collectionName: RAG_CONFIG.qdrant.documentsCollectionName,
    }
  );
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

  const vectorStore = await QdrantVectorStore.fromExistingCollection(
    getEmbeddings(),
    {
      url: RAG_CONFIG.qdrant.url,
      collectionName: RAG_CONFIG.qdrant.documentsCollectionName,
    }
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

export async function deleteDocumentChunks(attachmentId: string): Promise<void> {
  try {
    const { qdrantClient } = await import('@/constants/qdrant');
    const { collectionExists } = await import('./qdrant-init');
    
    const exists = await collectionExists(RAG_CONFIG.qdrant.documentsCollectionName);
    if (!exists) {
      return;
    }
    
    await qdrantClient.delete(RAG_CONFIG.qdrant.documentsCollectionName, {
      wait: true,
      filter: {
        must: [{ key: 'attachmentId', match: { value: attachmentId } }],
      },
    });
  } catch (error) {
    if (error && typeof error === 'object' && 'status' in error && error.status === 404) {
      return;
    }
    throw error;
  }
}
