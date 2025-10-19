import type { TokenValidationResult } from './client';

interface CacheEntry {
  result: TokenValidationResult;
  expiresAt: number;
}

const tokenCache = new Map<string, CacheEntry>();

const VALID_TOKEN_CACHE_TTL = 5 * 60 * 1000;
const INVALID_TOKEN_CACHE_TTL = 60 * 1000;

export function getCachedValidation(userId: string): TokenValidationResult | null {
  const entry = tokenCache.get(userId);
  
  if (!entry) {
    return null;
  }

  if (Date.now() > entry.expiresAt) {
    tokenCache.delete(userId);
    return null;
  }

  return entry.result;
}

export function setCachedValidation(userId: string, result: TokenValidationResult): void {
  const ttl = result.isValid ? VALID_TOKEN_CACHE_TTL : INVALID_TOKEN_CACHE_TTL;
  
  tokenCache.set(userId, {
    result,
    expiresAt: Date.now() + ttl,
  });
}

export function clearCachedValidation(userId: string): void {
  tokenCache.delete(userId);
}

export function clearAllCache(): void {
  tokenCache.clear();
}
