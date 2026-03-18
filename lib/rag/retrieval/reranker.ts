'use server';

import { CohereClientV2 } from 'cohere-ai';
import { RAG_CONFIG } from '../config';
import type { RerankDocument, RerankResult } from '@/types/rag';
import { logError, logWarn } from '@/lib/observability';

export async function rerankDocuments(
  query: string,
  documents: RerankDocument[],
  options: {
    topN?: number;
  } = {}
): Promise<RerankResult[]> {
  const apiKey = process.env.COHERE_API_KEY;
  
  if (!apiKey) {
    logWarn({
      event: 'reranker_disabled',
      message: 'COHERE_API_KEY not set, skipping reranking',
    });
    return documents.map(doc => ({
      ...doc,
      originalScore: doc.score,
    }));
  }

  if (documents.length === 0) {
    return [];
  }

  try {
    const cohere = new CohereClientV2({
      token: apiKey,
    });

    const topN = Math.min(options.topN ?? documents.length, documents.length);

    const response = await cohere.rerank({
      model: RAG_CONFIG.rerank.model,
      query,
      documents: documents.map(doc => doc.content),
      topN,
    });

    if (!response.results || response.results.length === 0) {
      logWarn({
        event: 'reranker_empty_results',
        message: 'No results from reranking, returning original order',
      });
      return documents.map(doc => ({
        ...doc,
        originalScore: doc.score,
      }));
    }

    const rerankedResults = response.results.map((result) => {
      const originalDoc = documents[result.index];
      return {
        content: originalDoc.content,
        score: result.relevanceScore,
        originalScore: originalDoc.score,
        metadata: originalDoc.metadata,
      };
    });

    return rerankedResults;
  } catch (error) {
    logError({
      event: 'reranker_failed',
      error: error instanceof Error ? error.message : String(error),
    });
    return documents.map(doc => ({
      ...doc,
      originalScore: doc.score,
    }));
  }
}
