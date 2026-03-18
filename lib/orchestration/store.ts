import type { PoolClient } from 'pg';
import { getPgPool } from '@/lib/rag/storage/pgvectorClient';
import {
  createRequestId,
  logError,
  logInfo,
  logOrchestrationJobEnqueue,
  logOrchestrationJobFinish,
  logOrchestrationJobStart,
  measureLatencyMs,
} from '@/lib/observability';
import {
  computeNextRetryAt,
  DEFAULT_JOB_MAX_ATTEMPTS,
  isLeaseExpired,
  shouldRetryJob,
} from './retryPolicy';

type OrchestrationJobType = 'deep_research' | 'document_process';
type OrchestrationJobStatus = 'queued' | 'running' | 'completed' | 'failed';
type DeepResearchRunStatus = 'running' | 'completed' | 'failed' | 'aborted';
const DEFAULT_LEASE_MS = 15 * 60 * 1000;

let initialized = false;
let initializationPromise: Promise<void> | null = null;

function safeJson(value: unknown): string {
  return JSON.stringify(value ?? {});
}

function extractAttachmentId(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') {
    return undefined;
  }

  const candidate = (payload as { attachmentId?: unknown }).attachmentId;
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : undefined;
}

interface OrchestrationJobRow {
  id: string;
  type: string;
  user_id: string;
  status: string;
  payload: unknown;
  result: unknown;
  error: string | null;
  attempts: number;
  max_attempts: number;
  next_attempt_at?: Date | string | null;
  lease_expires_at?: Date | string | null;
  created_at?: Date | string | null;
}

function mapOrchestrationJobRow(row: OrchestrationJobRow): OrchestrationJobRecord {
  return {
    id: row.id,
    type: row.type as OrchestrationJobType,
    userId: row.user_id,
    status: row.status as OrchestrationJobStatus,
    payload: row.payload,
    result: row.result,
    error: row.error,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    nextAttemptAt: row.next_attempt_at ? new Date(row.next_attempt_at).toISOString() : null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
  };
}

async function withTypeLock<T>(
  type: OrchestrationJobType,
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  await ensureOrchestrationTables();
  const client = await getPgPool().connect();

  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [type]);
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function upsertOrchestrationJob(
  client: PoolClient,
  params: {
    type: OrchestrationJobType;
    userId: string;
    payload: unknown;
    dedupeKey?: string;
    maxAttempts: number;
  }
): Promise<OrchestrationJobRow> {
  const jobId = createRequestId(`job_${params.type}`);
  const result = await client.query<OrchestrationJobRow>(
    `
      INSERT INTO orchestration_job (id, type, user_id, status, dedupe_key, payload, max_attempts, next_attempt_at)
      VALUES ($1, $2, $3, 'queued', $4, $5::jsonb, $6, NOW())
      ON CONFLICT (type, dedupe_key) WHERE dedupe_key IS NOT NULL
      DO UPDATE SET
        user_id = EXCLUDED.user_id,
        payload = EXCLUDED.payload,
        max_attempts = GREATEST(orchestration_job.max_attempts, EXCLUDED.max_attempts),
        status = CASE
          WHEN orchestration_job.status = 'failed'
            AND orchestration_job.attempts < orchestration_job.max_attempts THEN 'queued'
          ELSE orchestration_job.status
        END,
        result = CASE
          WHEN orchestration_job.status = 'failed'
            AND orchestration_job.attempts < orchestration_job.max_attempts THEN NULL
          ELSE orchestration_job.result
        END,
        error = CASE
          WHEN orchestration_job.status = 'failed'
            AND orchestration_job.attempts < orchestration_job.max_attempts THEN NULL
          ELSE orchestration_job.error
        END,
        lease_owner = CASE
          WHEN orchestration_job.status = 'failed'
            AND orchestration_job.attempts < orchestration_job.max_attempts THEN NULL
          ELSE orchestration_job.lease_owner
        END,
        lease_expires_at = CASE
          WHEN orchestration_job.status = 'failed'
            AND orchestration_job.attempts < orchestration_job.max_attempts THEN NULL
          ELSE orchestration_job.lease_expires_at
        END,
        next_attempt_at = CASE
          WHEN orchestration_job.status = 'failed'
            AND orchestration_job.attempts < orchestration_job.max_attempts THEN NOW()
          ELSE orchestration_job.next_attempt_at
        END,
        updated_at = NOW()
      RETURNING id, type, user_id, status, payload, result, error, attempts, max_attempts, next_attempt_at, lease_expires_at, created_at
    `,
    [
      jobId,
      params.type,
      params.userId,
      params.dedupeKey ?? null,
      safeJson(params.payload),
      params.maxAttempts,
    ]
  );

  return result.rows[0];
}

async function countRunningJobsWithClient(
  client: PoolClient,
  type: OrchestrationJobType
): Promise<number> {
  const result = await client.query<{ count: string }>(
    `
      SELECT COUNT(*)::text AS count
      FROM orchestration_job
      WHERE type = $1
        AND status = 'running'
        AND lease_expires_at > NOW()
    `,
    [type]
  );

  return Number(result.rows[0]?.count ?? 0);
}

function hasActiveLease(row: OrchestrationJobRow): boolean {
  if (row.status !== 'running') {
    return false;
  }

  if (!row.lease_expires_at) {
    return true;
  }

  return !isLeaseExpired(row.lease_expires_at);
}

async function startOrchestrationJobWithClient(
  client: PoolClient,
  params: {
    jobId: string;
    leaseOwner?: string;
    leaseMs?: number;
  }
): Promise<OrchestrationJobRow | null> {
  const leaseOwner = params.leaseOwner ?? createRequestId('lease');
  const leaseMs = params.leaseMs ?? DEFAULT_LEASE_MS;

  const result = await client.query<OrchestrationJobRow>(
    `
      UPDATE orchestration_job
      SET
        status = 'running',
        attempts = attempts + 1,
        lease_owner = $2,
        lease_expires_at = NOW() + ($3 || ' milliseconds')::interval,
        last_heartbeat_at = NOW(),
        updated_at = NOW()
      WHERE id = $1
        AND attempts < max_attempts
        AND (
          (status = 'queued' AND (next_attempt_at IS NULL OR next_attempt_at <= NOW()))
          OR (status = 'running' AND (lease_expires_at IS NULL OR lease_expires_at < NOW()))
        )
      RETURNING id, type, user_id, status, payload, result, error, attempts, max_attempts, next_attempt_at, lease_expires_at, created_at
    `,
    [params.jobId, leaseOwner, String(leaseMs)]
  );

  return result.rows[0] ?? null;
}

async function ensureOrchestrationTables(): Promise<void> {
  if (initialized) {
    return;
  }

  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    const pool = getPgPool();

    await pool.query(`
      CREATE TABLE IF NOT EXISTS orchestration_job (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        user_id TEXT NOT NULL,
        status TEXT NOT NULL,
        dedupe_key TEXT,
        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        result JSONB,
        error TEXT,
        attempts INT NOT NULL DEFAULT 0,
        max_attempts INT NOT NULL DEFAULT 3,
        next_attempt_at TIMESTAMPTZ,
        lease_owner TEXT,
        last_heartbeat_at TIMESTAMPTZ,
        lease_expires_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await pool.query(`
      ALTER TABLE orchestration_job
      ADD COLUMN IF NOT EXISTS max_attempts INT NOT NULL DEFAULT 3;
    `);

    await pool.query(`
      ALTER TABLE orchestration_job
      ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ;
    `);

    await pool.query(`
      ALTER TABLE orchestration_job
      ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMPTZ;
    `);

    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS orchestration_job_dedupe_idx
      ON orchestration_job (type, dedupe_key)
      WHERE dedupe_key IS NOT NULL;
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS orchestration_job_status_idx
      ON orchestration_job (type, status, created_at DESC);
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS orchestration_job_retry_idx
      ON orchestration_job (type, status, next_attempt_at ASC, created_at ASC);
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS deep_research_run (
        id TEXT PRIMARY KEY,
        request_id TEXT,
        user_id TEXT,
        conversation_id TEXT,
        query TEXT NOT NULL,
        status TEXT NOT NULL,
        current_node TEXT,
        checkpoint JSONB NOT NULL DEFAULT '{}'::jsonb,
        result JSONB,
        error TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS deep_research_run_status_idx
      ON deep_research_run (user_id, status, created_at DESC);
    `);

    initialized = true;
  })();

  return initializationPromise;
}

interface OrchestrationJobRecord {
  id: string;
  type: OrchestrationJobType;
  userId: string;
  status: OrchestrationJobStatus;
  payload: unknown;
  result?: unknown;
  error?: string | null;
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: string | null;
  createdAt: string | null;
}

export async function enqueueOrStartJobWithinCapacity(params: {
  type: OrchestrationJobType;
  userId: string;
  payload: unknown;
  dedupeKey?: string;
  maxRunning: number;
  maxAttempts?: number;
  leaseOwner?: string;
  leaseMs?: number;
  persistIfAtCapacity?: boolean;
}): Promise<{
  job: OrchestrationJobRecord | null;
  started: boolean;
  atCapacity: boolean;
}> {
  return withTypeLock(params.type, async (client) => {
    if (params.persistIfAtCapacity === false) {
      const runningJobs = await countRunningJobsWithClient(client, params.type);
      if (runningJobs >= params.maxRunning) {
        logInfo({
          event: 'orchestration_job_enqueue_capacity_blocked',
          jobType: params.type,
          userId: params.userId,
          maxRunning: params.maxRunning,
          runningJobs,
        });
        return {
          job: null,
          started: false,
          atCapacity: true,
        };
      }
    }

    const queuedJob = await upsertOrchestrationJob(client, {
      ...params,
      maxAttempts: params.maxAttempts ?? DEFAULT_JOB_MAX_ATTEMPTS,
    });
    const queuedRecord = mapOrchestrationJobRow(queuedJob);

    logOrchestrationJobEnqueue({
      jobId: queuedRecord.id,
      jobType: queuedRecord.type,
      userId: queuedRecord.userId,
      dedupeKey: params.dedupeKey,
      attempts: queuedRecord.attempts,
      attachmentId: extractAttachmentId(queuedRecord.payload),
      queued: queuedRecord.status === 'queued',
      started: false,
      atCapacity: false,
    });

    if (queuedJob.status === 'completed' || hasActiveLease(queuedJob)) {
      return {
        job: queuedRecord,
        started: false,
        atCapacity: false,
      };
    }

    const runningJobs = await countRunningJobsWithClient(client, params.type);
    if (runningJobs >= params.maxRunning) {
      logInfo({
        event: 'orchestration_job_queue_waiting_for_capacity',
        jobId: queuedRecord.id,
        jobType: queuedRecord.type,
        userId: queuedRecord.userId,
        runningJobs,
        maxRunning: params.maxRunning,
      });
      return {
        job: queuedRecord,
        started: false,
        atCapacity: true,
      };
    }

    const startedJob = await startOrchestrationJobWithClient(client, {
      jobId: queuedJob.id,
      leaseOwner: params.leaseOwner,
      leaseMs: params.leaseMs,
    });
    if (startedJob) {
      const startedRecord = mapOrchestrationJobRow(startedJob);
      logOrchestrationJobStart({
        jobId: startedRecord.id,
        jobType: startedRecord.type,
        userId: startedRecord.userId,
        attempts: startedRecord.attempts,
        attachmentId: extractAttachmentId(startedRecord.payload),
      });
    }

    return {
      job: mapOrchestrationJobRow(startedJob ?? queuedJob),
      started: Boolean(startedJob),
      atCapacity: false,
    };
  });
}

export async function claimNextQueuedJobWithinCapacity(params: {
  type: OrchestrationJobType;
  maxRunning: number;
  leaseMs?: number;
  leaseOwner?: string;
}): Promise<{
  job: OrchestrationJobRecord | null;
  atCapacity: boolean;
}> {
  return withTypeLock(params.type, async (client) => {
    await client.query(
      `
        UPDATE orchestration_job
        SET
          status = 'failed',
          error = COALESCE(error, 'Lease expired after max retry attempts'),
          lease_owner = NULL,
          lease_expires_at = NULL,
          next_attempt_at = NULL,
          updated_at = NOW()
        WHERE type = $1
          AND status = 'running'
          AND lease_expires_at < NOW()
          AND attempts >= max_attempts
      `,
      [params.type]
    );

    const runningJobs = await countRunningJobsWithClient(client, params.type);
    if (runningJobs >= params.maxRunning) {
      logInfo({
        event: 'orchestration_job_claim_at_capacity',
        jobType: params.type,
        runningJobs,
        maxRunning: params.maxRunning,
      });
      return { job: null, atCapacity: true };
    }

    const owner = params.leaseOwner ?? createRequestId(`claim_${params.type}`);
    const leaseMs = params.leaseMs ?? DEFAULT_LEASE_MS;
    const result = await client.query<OrchestrationJobRow>(
      `
        WITH next_job AS (
          SELECT id
          FROM orchestration_job
          WHERE type = $1
            AND (
              (status = 'queued'
                AND attempts < max_attempts
                AND (next_attempt_at IS NULL OR next_attempt_at <= NOW()))
              OR (
                status = 'running'
                AND attempts < max_attempts
                AND (lease_expires_at IS NULL OR lease_expires_at < NOW())
              )
            )
          ORDER BY next_attempt_at ASC NULLS FIRST, created_at ASC
          LIMIT 1
          FOR UPDATE SKIP LOCKED
        )
        UPDATE orchestration_job
        SET
          status = 'running',
          attempts = attempts + 1,
          lease_owner = $2,
          lease_expires_at = NOW() + ($3 || ' milliseconds')::interval,
          last_heartbeat_at = NOW(),
          updated_at = NOW()
        WHERE id IN (SELECT id FROM next_job)
        RETURNING id, type, user_id, status, payload, result, error, attempts, max_attempts, next_attempt_at, lease_expires_at, created_at
      `,
      [params.type, owner, String(leaseMs)]
    );

    if (result.rows[0]) {
      const claimedRecord = mapOrchestrationJobRow(result.rows[0]);
      logOrchestrationJobStart({
        jobId: claimedRecord.id,
        jobType: claimedRecord.type,
        userId: claimedRecord.userId,
        attempts: claimedRecord.attempts,
        attachmentId: extractAttachmentId(claimedRecord.payload),
      });
    }

    return {
      job: result.rows[0] ? mapOrchestrationJobRow(result.rows[0]) : null,
      atCapacity: false,
    };
  });
}

export async function heartbeatOrchestrationJobLease(params: {
  jobId: string;
  leaseOwner?: string;
  leaseMs?: number;
}): Promise<boolean> {
  await ensureOrchestrationTables();
  const pool = getPgPool();
  const leaseMs = params.leaseMs ?? DEFAULT_LEASE_MS;
  const hasOwnerConstraint = Boolean(params.leaseOwner);

  const result = await pool.query(
    `
      UPDATE orchestration_job
      SET
        lease_expires_at = NOW() + ($3 || ' milliseconds')::interval,
        last_heartbeat_at = NOW(),
        updated_at = NOW()
      WHERE id = $1
        AND status = 'running'
        AND ($2::boolean = FALSE OR lease_owner = $4)
    `,
    [params.jobId, hasOwnerConstraint, String(leaseMs), params.leaseOwner ?? null]
  );

  return (result.rowCount ?? 0) > 0;
}

export async function resolveOrchestrationJobRun(params: {
  jobId: string;
  succeeded: boolean;
  result?: unknown;
  error?: string;
  retryable?: boolean;
  retryAt?: Date;
}): Promise<{ status: OrchestrationJobStatus; retried: boolean } | null> {
  await ensureOrchestrationTables();
  const pool = getPgPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const rowResult = await client.query<OrchestrationJobRow>(
      `
        SELECT
          id, type, user_id, status, payload, result, error,
          attempts, max_attempts, next_attempt_at, lease_expires_at, created_at
        FROM orchestration_job
        WHERE id = $1
        FOR UPDATE
      `,
      [params.jobId]
    );

    const existing = rowResult.rows[0];
    if (!existing) {
      await client.query('ROLLBACK');
      return null;
    }

    if (params.succeeded) {
      await client.query(
        `
          UPDATE orchestration_job
          SET
            status = 'completed',
            result = $2::jsonb,
            error = NULL,
            lease_owner = NULL,
            lease_expires_at = NULL,
            next_attempt_at = NULL,
            updated_at = NOW()
          WHERE id = $1
        `,
        [params.jobId, safeJson(params.result)]
      );

      await client.query('COMMIT');
      logOrchestrationJobFinish({
        jobId: existing.id,
        jobType: existing.type,
        userId: existing.user_id,
        attempts: existing.attempts,
        attachmentId: extractAttachmentId(existing.payload),
        latencyMs: existing.created_at ? measureLatencyMs(new Date(existing.created_at).getTime()) : undefined,
      });
      return { status: 'completed', retried: false };
    }

    const retryable = params.retryable ?? true;
    if (
      shouldRetryJob({
        attempts: existing.attempts,
        maxAttempts: existing.max_attempts,
        retryable,
      })
    ) {
      const retryAt = params.retryAt ?? computeNextRetryAt(existing.attempts);
      await client.query(
        `
          UPDATE orchestration_job
          SET
            status = 'queued',
            result = $2::jsonb,
            error = $3,
            lease_owner = NULL,
            lease_expires_at = NULL,
            next_attempt_at = $4,
            updated_at = NOW()
          WHERE id = $1
        `,
        [params.jobId, safeJson(params.result), params.error ?? 'Job failed', retryAt]
      );

      await client.query('COMMIT');
      logInfo({
        event: 'orchestration_job_requeued',
        jobId: existing.id,
        jobType: existing.type,
        userId: existing.user_id,
        attempts: existing.attempts,
        maxAttempts: existing.max_attempts,
        nextAttemptAt: retryAt.toISOString(),
        error: params.error ?? 'Job failed',
      });
      return { status: 'queued', retried: true };
    }

    await client.query(
      `
        UPDATE orchestration_job
        SET
          status = 'failed',
          result = $2::jsonb,
          error = $3,
          lease_owner = NULL,
          lease_expires_at = NULL,
          next_attempt_at = NULL,
          updated_at = NOW()
        WHERE id = $1
      `,
      [params.jobId, safeJson(params.result), params.error ?? 'Job failed']
    );
    await client.query('COMMIT');
    logOrchestrationJobFinish({
      jobId: existing.id,
      jobType: existing.type,
      userId: existing.user_id,
      attempts: existing.attempts,
      attachmentId: extractAttachmentId(existing.payload),
      latencyMs: existing.created_at ? measureLatencyMs(new Date(existing.created_at).getTime()) : undefined,
      error: params.error ?? 'Job failed',
    });
    return { status: 'failed', retried: false };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function finishOrchestrationJob(
  jobId: string,
  status: Extract<OrchestrationJobStatus, 'completed' | 'failed'>,
  payload?: { result?: unknown; error?: string }
): Promise<void> {
  await ensureOrchestrationTables();
  const pool = getPgPool();
  const result = await pool.query<OrchestrationJobRow>(
    `
      UPDATE orchestration_job
      SET
        status = $2,
        result = $3::jsonb,
        error = $4,
        lease_owner = NULL,
        lease_expires_at = NULL,
        next_attempt_at = NULL,
        updated_at = NOW()
      WHERE id = $1
      RETURNING id, type, user_id, payload, attempts, created_at
    `,
    [jobId, status, safeJson(payload?.result), payload?.error ?? null]
  );

  const finished = result.rows[0];
  if (finished) {
    logOrchestrationJobFinish({
      jobId: finished.id,
      jobType: finished.type,
      userId: finished.user_id,
      attempts: finished.attempts,
      attachmentId: extractAttachmentId(finished.payload),
      latencyMs: finished.created_at ? measureLatencyMs(new Date(finished.created_at).getTime()) : undefined,
      error: status === 'failed' ? payload?.error : undefined,
    });
  }
}

export async function createDeepResearchRun(params: {
  userId?: string;
  conversationId?: string;
  query: string;
  requestId?: string;
}): Promise<string | null> {
  try {
    await ensureOrchestrationTables();
    const pool = getPgPool();
    const runId = createRequestId('research');

    await pool.query(
      `
        INSERT INTO deep_research_run (id, request_id, user_id, conversation_id, query, status)
        VALUES ($1, $2, $3, $4, $5, 'running')
      `,
      [runId, params.requestId ?? null, params.userId ?? null, params.conversationId ?? null, params.query]
    );

    return runId;
  } catch (error) {
    logError({
      event: 'deep_research_run_create_failed',
      requestId: params.requestId,
      userId: params.userId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export async function saveDeepResearchCheckpoint(params: {
  runId: string;
  node: string;
  state: unknown;
  requestId?: string;
}): Promise<void> {
  try {
    await ensureOrchestrationTables();
    const pool = getPgPool();
    await pool.query(
      `
        UPDATE deep_research_run
        SET current_node = $2,
            checkpoint = $3::jsonb,
            updated_at = NOW()
        WHERE id = $1
      `,
      [params.runId, params.node, safeJson(params.state)]
    );
  } catch (error) {
    logError({
      event: 'deep_research_checkpoint_failed',
      requestId: params.requestId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function finishDeepResearchRun(params: {
  runId: string;
  status: DeepResearchRunStatus;
  result?: unknown;
  error?: string;
  requestId?: string;
}): Promise<void> {
  try {
    await ensureOrchestrationTables();
    const pool = getPgPool();
    await pool.query(
      `
        UPDATE deep_research_run
        SET status = $2,
            result = $3::jsonb,
            error = $4,
            updated_at = NOW()
        WHERE id = $1
      `,
      [params.runId, params.status, safeJson(params.result), params.error ?? null]
    );
  } catch (error) {
    logError({
      event: 'deep_research_run_finish_failed',
      requestId: params.requestId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
