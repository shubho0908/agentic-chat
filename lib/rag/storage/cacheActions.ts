'use server';

import { headers } from 'next/headers';
import { getAuthenticatedUser } from '@/lib/apiUtils';
import { generateEmbedding, searchSemanticCacheEntry, addToSemanticCache } from './cache';
import { SIMILARITY_THRESHOLD, CACHE_TTL_SECONDS } from './pgvectorClient';
import { cacheGateDefersToOrchestrator, gateCacheHit, type JevCacheGateState } from '@/lib/jev/cacheGate';
import { MIN_CACHEABLE_QUERY_LENGTH } from '@/lib/orchestrator/constants';
import { logger } from '@/lib/logger';

async function auth() {
  const { user, error } = await getAuthenticatedUser(await headers());
  if (error || !user) throw new Error('Authentication required');
  return user;
}

interface CacheCheckResult {
  cached: boolean;
  response?: string;
  latency?: number;
  error?: string;
}

interface CacheSaveResult {
  success: boolean;
  error?: string;
}

function shouldUseSemanticCache(query: string): boolean {
  return query.trim().length >= MIN_CACHEABLE_QUERY_LENGTH;
}

export async function checkSemanticCacheAction(query: string, conversationId?: string): Promise<CacheCheckResult> {
  const user = await auth();

  const startTime = Date.now();

  try {

    if (!query || query.trim().length === 0) {
      return {
        cached: false,
        error: 'Query is required',
        latency: Date.now() - startTime
      };
    }

    if (!shouldUseSemanticCache(query)) {
      return {
        cached: false,
        latency: Date.now() - startTime,
      };
    }

    // Active mode: defer to the orchestrator's single gated lookup so each
    // entry is evaluated exactly once. Serving here after an orchestrator
    // veto (or vetoing here and being overridden there) would make the
    // gate meaningless. Shadow/ab keep this fast path; they never change
    // behavior. Skips the embedding call entirely.
    if (cacheGateDefersToOrchestrator()) {
      return {
        cached: false,
        latency: Date.now() - startTime,
      };
    }

    const queryEmbedding = await generateEmbedding(query, user.id);
    const entry = await searchSemanticCacheEntry(queryEmbedding, user.id, conversationId);

    const latency = Date.now() - startTime;

    if (entry) {
      // Jev cache gate: structural signals only, never query/answer content.
      // Shadow logs and serves; active can veto a confident no-serve verdict;
      // every failure path fails open to serving the hit.
      const round4 = (value: number) => Math.round(value * 10_000) / 10_000;
      const gateState: JevCacheGateState = {
        similarityScore: round4(entry.score),
        similarityThreshold: SIMILARITY_THRESHOLD,
        scoreMargin: round4(entry.score - SIMILARITY_THRESHOLD),
        cacheAgeSeconds: Math.max(
          0,
          Math.round((Date.now() - entry.createdAt.getTime()) / 1000),
        ),
        cacheTtlSeconds: CACHE_TTL_SECONDS,
        entryScopedToConversation: entry.conversationId !== null,
        queryLengthChars: query.length,
        answerLengthChars: entry.answer.length,
      };
      const gate = await gateCacheHit(gateState, conversationId);
      if (!gate.serve) {
        logger.log(`[Cache] HIT vetoed by Jev gate in ${latency}ms`);
        return { cached: false, latency };
      }
      logger.log(`[Cache] HIT in ${latency}ms`);
      return {
        cached: true,
        response: entry.answer,
        latency
      };
    }

    logger.log(`[Cache] MISS in ${latency}ms`);
    return { cached: false, latency };

  } catch (error) {
    const latency = Date.now() - startTime;
    logger.error('[Cache] Check failed:', error);
    return {
      cached: false,
      error: error instanceof Error ? error.message : 'Cache check failed',
      latency
    };
  }
}

export async function saveToSemanticCacheAction(
  query: string,
  response: string,
  conversationId?: string
): Promise<CacheSaveResult> {
  const user = await auth();

  try {

    if (!query || query.trim().length === 0) {
      return { success: false, error: 'Query is required' };
    }
    if (!response || response.trim().length === 0) {
      return { success: false, error: 'Response is required' };
    }
    if (!shouldUseSemanticCache(query)) {
      return { success: true };
    }

    const queryEmbedding = await generateEmbedding(query, user.id);
    await addToSemanticCache(query, response, queryEmbedding, user.id, conversationId);

    logger.log('[Cache] Saved successfully');
    return { success: true };

  } catch (error) {
    logger.error('[Cache] Save failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Cache save failed'
    };
  }
}
