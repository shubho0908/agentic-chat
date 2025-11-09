'use server';

import { headers } from 'next/headers';
import { getAuthenticatedUser } from '@/lib/api-utils';
import { generateEmbedding, searchSemanticCache, addToSemanticCache } from './cache';

export interface CacheCheckResult {
  cached: boolean;
  response?: string;
  latency?: number;
  error?: string;
}

export interface CacheSaveResult {
  success: boolean;
  error?: string;
}

export async function checkSemanticCacheAction(query: string): Promise<CacheCheckResult> {
  const startTime = Date.now();

  try {
    const { user, error } = await getAuthenticatedUser(await headers());
    if (error || !user) {
      return {
        cached: false,
        error: 'Authentication required',
        latency: Date.now() - startTime
      };
    }

    if (!query || query.trim().length === 0) {
      return {
        cached: false,
        error: 'Query is required',
        latency: Date.now() - startTime
      };
    }

    const queryEmbedding = await generateEmbedding(query, user.id);
    const cachedResponse = await searchSemanticCache(queryEmbedding, user.id);

    const latency = Date.now() - startTime;

    if (cachedResponse) {
      console.log(`[Cache] HIT in ${latency}ms`);
      return {
        cached: true,
        response: cachedResponse,
        latency
      };
    }

    console.log(`[Cache] MISS in ${latency}ms`);
    return { cached: false, latency };

  } catch (error) {
    const latency = Date.now() - startTime;
    console.error('[Cache] Check failed:', error);
    return {
      cached: false,
      error: error instanceof Error ? error.message : 'Cache check failed',
      latency
    };
  }
}

export async function saveToSemanticCacheAction(
  query: string,
  response: string
): Promise<CacheSaveResult> {
  try {
    const { user, error } = await getAuthenticatedUser(await headers());
    if (error || !user) {
      return { success: false, error: 'Authentication required' };
    }

    if (!query || query.trim().length === 0) {
      return { success: false, error: 'Query is required' };
    }
    if (!response || response.trim().length === 0) {
      return { success: false, error: 'Response is required' };
    }

    const queryEmbedding = await generateEmbedding(query, user.id);
    await addToSemanticCache(query, response, queryEmbedding, user.id);

    console.log('[Cache] Saved successfully');
    return { success: true };

  } catch (error) {
    console.error('[Cache] Save failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Cache save failed'
    };
  }
}
