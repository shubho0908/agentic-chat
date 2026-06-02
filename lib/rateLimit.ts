import { NextResponse } from "next/server";

interface SlidingWindowEntry {
  timestamps: number[];
}

const store = new Map<string, SlidingWindowEntry>();

const CLEANUP_INTERVAL_MS = 60_000;
let lastCleanup = Date.now();

function cleanup(windowMs: number) {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  const cutoff = now - windowMs;
  for (const [key, entry] of store) {
    entry.timestamps = entry.timestamps.filter((t) => t > cutoff);
    if (entry.timestamps.length === 0) store.delete(key);
  }
}

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

export const RATE_LIMITS = {
  chat: { windowMs: 60_000, maxRequests: 20 } satisfies RateLimitConfig,
  approval: { windowMs: 60_000, maxRequests: 10 } satisfies RateLimitConfig,
  research: { windowMs: 300_000, maxRequests: 5 } satisfies RateLimitConfig,
} as const;

export function isRateLimited(
  userId: string,
  endpoint: string,
  config: RateLimitConfig
): boolean {
  const key = `${userId}:${endpoint}`;
  const now = Date.now();
  const cutoff = now - config.windowMs;

  cleanup(config.windowMs);

  const entry = store.get(key);
  if (!entry) return false;

  const recent = entry.timestamps.filter((t) => t > cutoff);
  return recent.length >= config.maxRequests;
}

export function recordUsage(userId: string, endpoint: string): void {
  const key = `${userId}:${endpoint}`;
  let entry = store.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    store.set(key, entry);
  }
  entry.timestamps.push(Date.now());
}

export function checkRateLimit(
  userId: string,
  endpoint: string,
  config: RateLimitConfig
): NextResponse | null {
  const key = `${userId}:${endpoint}`;
  const now = Date.now();
  const cutoff = now - config.windowMs;

  cleanup(config.windowMs);

  let entry = store.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    store.set(key, entry);
  }

  entry.timestamps = entry.timestamps.filter((t) => t > cutoff);

  if (entry.timestamps.length >= config.maxRequests) {
    const retryAfter = Math.ceil(
      (entry.timestamps[0] + config.windowMs - now) / 1000
    );
    const friendlyWait = retryAfter > 60
      ? `${Math.ceil(retryAfter / 60)} minute${Math.ceil(retryAfter / 60) > 1 ? "s" : ""}`
      : `${retryAfter} second${retryAfter > 1 ? "s" : ""}`;
    return NextResponse.json(
      { error: `You're sending messages too quickly. Please wait about ${friendlyWait} and try again.` },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfter) },
      }
    );
  }

  entry.timestamps.push(now);
  return null;
}
