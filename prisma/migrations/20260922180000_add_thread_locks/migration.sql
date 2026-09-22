-- Cross-instance lease for one graph thread. Replaces session-level
-- pg_advisory_lock, which the pooled (PgBouncer transaction-mode) database URL
-- does not support. Fencing token + expiry make crash/kill recovery
-- self-healing: an orphaned row stops being valid at expires_at.
CREATE TABLE "thread_locks" (
    "thread_id" TEXT NOT NULL,
    "owner_token" TEXT NOT NULL,
    "acquired_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "thread_locks_pkey" PRIMARY KEY ("thread_id")
);

CREATE INDEX "thread_locks_expires_idx" ON "thread_locks"("expires_at");
