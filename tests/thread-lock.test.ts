import test from "node:test";
import assert from "node:assert/strict";

import {
  acquireThreadLock,
  ThreadLockTimeoutError,
  THREAD_LOCK_ACQUIRE_SQL,
  THREAD_LOCK_RELEASE_SQL,
  THREAD_LOCK_LEASE_TTL_MS,
  THREAD_LOCK_WAIT_TIMEOUT_MS,
  type ThreadLockStore,
} from "@/lib/orchestrator/threadLock";
import { ORCHESTRATOR_STREAM_DEADLINE_MS } from "@/lib/orchestrator/constants";

interface FakeRow {
  ownerToken: string;
  expiresAt: number;
}

/** In-memory store with the same lease semantics as the Postgres store. */
class FakeLockStore implements ThreadLockStore {
  rows = new Map<string, FakeRow>();
  releaseFailures: Error[] = [];

  constructor(private readonly clock: () => number = Date.now) {}

  async tryAcquire(
    threadId: string,
    ownerToken: string,
    leaseTtlMs: number,
  ): Promise<boolean> {
    const now = this.clock();
    const existing = this.rows.get(threadId);
    if (existing && existing.expiresAt > now) return false;
    this.rows.set(threadId, { ownerToken, expiresAt: now + leaseTtlMs });
    return true;
  }

  async release(threadId: string, ownerToken: string): Promise<void> {
    const failure = this.releaseFailures.shift();
    if (failure) throw failure;
    const existing = this.rows.get(threadId);
    if (existing && existing.ownerToken === ownerToken) {
      this.rows.delete(threadId);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("acquires a free thread and release frees it", async () => {
  const store = new FakeLockStore();
  const lock = await acquireThreadLock("conv-1", { store });
  assert.equal(store.rows.has("conv-1"), true);
  await lock.release();
  assert.equal(store.rows.has("conv-1"), false);
});

test("contended acquirer waits, then proceeds after the holder releases", async () => {
  const store = new FakeLockStore();
  const first = await acquireThreadLock("conv-1", { store });

  let secondAcquired = false;
  const pending = acquireThreadLock("conv-1", {
    store,
    waitTimeoutMs: 2_000,
    pollIntervalMs: 10,
  }).then((lock) => {
    secondAcquired = true;
    return lock;
  });

  await sleep(50);
  assert.equal(
    secondAcquired,
    false,
    "must wait while a live holder owns the row",
  );

  await first.release();
  const second = await pending;
  assert.equal(secondAcquired, true);
  assert.equal(store.rows.has("conv-1"), true);
  await second.release();
});

test("an expired lease is stolen immediately", async () => {
  const store = new FakeLockStore();
  store.rows.set("conv-1", {
    ownerToken: "dead-holder",
    expiresAt: Date.now() - 1,
  });

  const lock = await acquireThreadLock("conv-1", {
    store,
    waitTimeoutMs: 50,
    pollIntervalMs: 10,
  });
  assert.notEqual(store.rows.get("conv-1")?.ownerToken, "dead-holder");
  await lock.release();
});

test("a live lease is never stolen and the wait times out with a bounded error", async () => {
  const store = new FakeLockStore();
  store.rows.set("conv-1", {
    ownerToken: "live-holder",
    expiresAt: Date.now() + 60_000,
  });

  await assert.rejects(
    acquireThreadLock("conv-1", {
      store,
      waitTimeoutMs: 60,
      pollIntervalMs: 10,
    }),
    (error: unknown) => {
      assert.ok(error instanceof ThreadLockTimeoutError);
      assert.equal(error.threadId, "conv-1");
      return true;
    },
  );
  assert.equal(store.rows.get("conv-1")?.ownerToken, "live-holder");
});

test("the wait observes the abort signal instead of hanging", async () => {
  const store = new FakeLockStore();
  store.rows.set("conv-1", {
    ownerToken: "live-holder",
    expiresAt: Date.now() + 60_000,
  });

  const abortController = new AbortController();
  setTimeout(() => abortController.abort(), 20);

  await assert.rejects(
    acquireThreadLock("conv-1", {
      store,
      waitTimeoutMs: 5_000,
      pollIntervalMs: 10,
      signal: abortController.signal,
    }),
    (error: unknown) => error instanceof Error && error.name === "AbortError",
  );
});

test("release is fenced by owner token: a stale holder cannot drop the new owner's lease", async () => {
  let now = 1_000;
  const store = new FakeLockStore(() => now);

  const stale = await acquireThreadLock("conv-1", { store, leaseTtlMs: 30 });
  const staleToken = store.rows.get("conv-1")?.ownerToken;
  assert.ok(staleToken);

  now += 50; // stale holder's lease has expired (e.g. Vercel hard-kill)
  const current = await acquireThreadLock("conv-1", {
    store,
    leaseTtlMs: 1_000,
  });
  assert.notEqual(store.rows.get("conv-1")?.ownerToken, staleToken);

  await stale.release();
  assert.equal(
    store.rows.has("conv-1"),
    true,
    "stale release must not delete the current owner's row",
  );

  await current.release();
  assert.equal(store.rows.has("conv-1"), false);
});

test("release is idempotent", async () => {
  const store = new FakeLockStore();
  const lock = await acquireThreadLock("conv-1", { store });
  await lock.release();
  await lock.release();
  assert.equal(store.rows.has("conv-1"), false);
});

test("release never throws when the store fails; the lease TTL self-heals", async () => {
  const store = new FakeLockStore();
  const lock = await acquireThreadLock("conv-1", { store });
  store.releaseFailures.push(new Error("database unreachable"));
  await lock.release(); // must resolve, not reject
  assert.equal(
    store.rows.has("conv-1"),
    true,
    "row remains but expires at its TTL",
  );
});

test("lease TTL outlives any possible holder and the wait stays under the stream deadline", () => {
  // Vercel hard-kills invocations at maxDuration = 300s; the lease must never
  // revoke a live holder, and the wait must end while the handler can still
  // stream the timeout error back to the client.
  assert.ok(THREAD_LOCK_LEASE_TTL_MS > 300_000);
  assert.ok(THREAD_LOCK_WAIT_TIMEOUT_MS < ORCHESTRATOR_STREAM_DEADLINE_MS);
  assert.ok(ORCHESTRATOR_STREAM_DEADLINE_MS < 300_000);
});

test("postgres statements are pool-safe: no session-level locking primitives", () => {
  const statements = `${THREAD_LOCK_ACQUIRE_SQL}\n${THREAD_LOCK_RELEASE_SQL}`;
  assert.doesNotMatch(statements, /pg_advisory/i);
  assert.doesNotMatch(
    statements,
    /\bBEGIN\b|\bLISTEN\b|\bNOTIFY\b|\bPREPARE\b/i,
  );
  assert.match(THREAD_LOCK_ACQUIRE_SQL, /ON CONFLICT \(thread_id\) DO UPDATE/);
  assert.match(THREAD_LOCK_ACQUIRE_SQL, /expires_at <= now\(\)/);
  assert.match(THREAD_LOCK_RELEASE_SQL, /owner_token = \$2/);
});
