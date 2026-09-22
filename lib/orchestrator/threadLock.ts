import pg from "pg";
import { randomUUID } from "node:crypto";
import { logger } from "@/lib/logger";

/**
 * Mutual exclusion for one graph thread, built as a database-row lease instead
 * of a PostgreSQL advisory lock.
 *
 * Why not pg_advisory_lock: production connects through the Neon pooler
 * (PgBouncer transaction mode), where session-level advisory locks are
 * unsupported. A single statement may run on one backend while the matching
 * unlock runs on another, so the old lock either no-oped (reopening the
 * two-tab race) or leaked and blocked the next waiter forever. The checkpointer
 * never had this problem because PostgresSaver only uses single-client
 * transactions, which transaction-mode pooling supports.
 *
 * Why a row lease: every statement below is self-contained, so the lock is
 * correct on any connection shape (pooled or direct). Ownership is fenced by a
 * random token and the lease carries an expiry, so a crashed or hard-killed
 * holder (Vercel kills invocations at maxDuration = 300s) can never orphan a
 * lock - the row simply stops being valid.
 *
 * The lease TTL is fixed at acquisition and deliberately outlives the longest
 * possible legitimate holder (maxDuration 300s + margin), so a live holder is
 * never revoked and no heartbeat traffic is needed. The 64-bit
 * hashtextextended collision risk from the advisory-lock key is gone too:
 * threads are keyed by their full thread_id text.
 */

/** Outlives the longest possible holder: Vercel maxDuration (300s) + margin. */
export const THREAD_LOCK_LEASE_TTL_MS = 330_000;
/**
 * Bounded wait, kept under the orchestrator stream deadline (285s) so a
 * contended request always ends in a client-visible error, never an infinite
 * spinner.
 */
export const THREAD_LOCK_WAIT_TIMEOUT_MS = 270_000;
export const THREAD_LOCK_POLL_INTERVAL_MS = 250;

export class ThreadLockTimeoutError extends Error {
  readonly threadId: string;

  constructor(threadId: string, waitTimeoutMs: number) {
    super(
      `Timed out after ${waitTimeoutMs}ms waiting for thread lock "${threadId}"`,
    );
    this.name = "ThreadLockTimeoutError";
    this.threadId = threadId;
  }
}

function createAbortError(): Error {
  const error = new Error("Aborted while waiting for thread lock");
  error.name = "AbortError";
  return error;
}

export interface ThreadLockStore {
  /**
   * Atomically inserts the lease, or steals it when the existing row is
   * expired. Returns true when this caller owns the lock afterwards.
   */
  tryAcquire(
    threadId: string,
    ownerToken: string,
    leaseTtlMs: number,
  ): Promise<boolean>;
  /** Deletes the lease only when the fencing token still matches. */
  release(threadId: string, ownerToken: string): Promise<void>;
}

export const THREAD_LOCK_ACQUIRE_SQL = `INSERT INTO thread_locks (thread_id, owner_token, expires_at)
VALUES ($1, $2, now() + $3::float8 * interval '1 millisecond')
ON CONFLICT (thread_id) DO UPDATE
  SET owner_token = EXCLUDED.owner_token,
      acquired_at = now(),
      expires_at = EXCLUDED.expires_at
  WHERE thread_locks.expires_at <= now()
RETURNING owner_token`;

export const THREAD_LOCK_RELEASE_SQL =
  "DELETE FROM thread_locks WHERE thread_id = $1 AND owner_token = $2";

class PostgresThreadLockStore implements ThreadLockStore {
  private static pool: pg.Pool | null = null;

  private static getPool(): pg.Pool {
    if (PostgresThreadLockStore.pool) return PostgresThreadLockStore.pool;
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is required for thread locking");
    }
    PostgresThreadLockStore.pool = new pg.Pool({
      connectionString,
      max: 5,
      // Bound every stage of the acquisition round trip. A saturated pool or
      // an unresponsive database must fail tryAcquire fast so the wait loop
      // can re-check its deadline and the request abort, instead of parking
      // past both into the platform's hard kill.
      connectionTimeoutMillis: 5_000,
      statement_timeout: 5_000,
      query_timeout: 10_000,
    });
    return PostgresThreadLockStore.pool;
  }

  async tryAcquire(
    threadId: string,
    ownerToken: string,
    leaseTtlMs: number,
  ): Promise<boolean> {
    const result = await PostgresThreadLockStore.getPool().query(
      THREAD_LOCK_ACQUIRE_SQL,
      [threadId, ownerToken, leaseTtlMs],
    );
    return result.rowCount !== null && result.rowCount > 0;
  }

  async release(threadId: string, ownerToken: string): Promise<void> {
    await PostgresThreadLockStore.getPool().query(THREAD_LOCK_RELEASE_SQL, [
      threadId,
      ownerToken,
    ]);
  }
}

let sharedStore: ThreadLockStore | null = null;

function getSharedStore(): ThreadLockStore {
  if (!sharedStore) {
    sharedStore = new PostgresThreadLockStore();
  }
  return sharedStore;
}

export interface ThreadLock {
  release(): Promise<void>;
}

export interface AcquireThreadLockOptions {
  store?: ThreadLockStore;
  waitTimeoutMs?: number;
  pollIntervalMs?: number;
  leaseTtlMs?: number;
  /** Cancellation for the wait loop, e.g. the request abort signal. */
  signal?: AbortSignal;
  /** Injectable for tests. */
  now?: () => number;
  /** Injectable for tests; must reject with an AbortError when signalled. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(createAbortError());
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(createAbortError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Acquires the lease for a thread, waiting while a live holder owns it.
 * Resolves once owned, rejects with ThreadLockTimeoutError after
 * waitTimeoutMs, and rejects with an AbortError if the signal fires. The
 * returned release() never throws: a failed delete self-heals at lease expiry.
 */
export async function acquireThreadLock(
  threadId: string,
  options: AcquireThreadLockOptions = {},
): Promise<ThreadLock> {
  const {
    store = getSharedStore(),
    waitTimeoutMs = THREAD_LOCK_WAIT_TIMEOUT_MS,
    pollIntervalMs = THREAD_LOCK_POLL_INTERVAL_MS,
    leaseTtlMs = THREAD_LOCK_LEASE_TTL_MS,
    signal,
    now = Date.now,
    sleep = defaultSleep,
  } = options;

  const ownerToken = randomUUID();
  const deadline = now() + waitTimeoutMs;

  for (;;) {
    if (signal?.aborted) throw createAbortError();

    if (await store.tryAcquire(threadId, ownerToken, leaseTtlMs)) {
      let released = false;
      return {
        async release() {
          if (released) return;
          released = true;
          try {
            await store.release(threadId, ownerToken);
          } catch (error) {
            // The lease expires on its own, so a failed release is
            // self-healing; never let cleanup mask the real outcome.
            logger.warn(
              "[ThreadLock] Failed to release lease; it will expire",
              {
                threadId,
                error: error instanceof Error ? error.message : String(error),
              },
            );
          }
        },
      };
    }

    if (now() + pollIntervalMs > deadline) {
      throw new ThreadLockTimeoutError(threadId, waitTimeoutMs);
    }

    await sleep(pollIntervalMs, signal);
  }
}
