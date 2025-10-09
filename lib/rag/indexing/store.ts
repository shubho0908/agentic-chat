'use server';

import { QdrantVectorStore } from '@langchain/qdrant';
import { OpenAIEmbeddings } from '@langchain/openai';
import type { Document } from '@langchain/core/documents';
import { ensureDocumentsCollection, collectionExists } from '../storage/qdrant-init';
import { RAG_CONFIG } from '../config';

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

export async function deleteDocumentChunks(attachmentId: string): Promise<void> {
  try {
    const { qdrantClient } = await import('../storage/qdrant-client');
    
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
