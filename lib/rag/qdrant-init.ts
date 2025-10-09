'use server';

import { qdrantClient } from '@/constants/qdrant';
import { RAG_CONFIG } from './config';

let collectionInitialized = false;
let initializationPromise: Promise<void> | null = null;

export async function ensureDocumentsCollection(): Promise<void> {
  if (collectionInitialized) {
    return;
  }

  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    try {
      const exists = await collectionExists(RAG_CONFIG.qdrant.documentsCollectionName);

      if (!exists) {
        console.log(`[Qdrant] Creating collection: ${RAG_CONFIG.qdrant.documentsCollectionName}`);
        await qdrantClient.createCollection(RAG_CONFIG.qdrant.documentsCollectionName, {
          vectors: {
            size: RAG_CONFIG.qdrant.embeddingDimensions,
            distance: 'Cosine',
          },
          optimizers_config: {
            default_segment_number: 2,
          },
          replication_factor: 1,
        });
        console.log(`[Qdrant] Collection created: ${RAG_CONFIG.qdrant.documentsCollectionName}`);
      }

      collectionInitialized = true;
    } catch (error) {
      console.error('[Qdrant] Error ensuring collection exists:', error);
      initializationPromise = null;
      throw error;
    }
  })();

  return initializationPromise;
}

export async function collectionExists(collectionName: string): Promise<boolean> {
  try {
    const collections = await qdrantClient.getCollections();
    return collections.collections.some((col) => col.name === collectionName);
  } catch (error) {
    console.error('[Qdrant] Error checking collection existence:', error);
    return false;
  }
}
