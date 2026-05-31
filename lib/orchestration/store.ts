import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import {
  createRequestId,
  logInfo,
  logOrchestrationJobEnqueue,
  logOrchestrationJobFinish,
  logOrchestrationJobStart,
  logWarn,
  measureLatencyMs,
} from '@/lib/observability';
import {
  computeNextRetryAt,
  DEFAULT_JOB_MAX_ATTEMPTS,
  isLeaseExpired,
  shouldRetryJob,
} from './retryPolicy';
import { toJsonValue } from '@/lib/json';

type OrchestrationJobType = 'document_process';
type OrchestrationJobStatus = 'queued' | 'running' | 'completed' | 'failed';
const DEFAULT_LEASE_MS = 15 * 60 * 1000;

function safeJson(value: unknown): string {
  return JSON.stringify(toJsonValue(value) ?? {});
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
  lease_owner?: string | null;
  next_attempt_at?: Date | string | null;
  lease_expires_at?: Date | string | null;
  created_at?: Date | string | null;
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

function hasActiveLease(row: OrchestrationJobRow): boolean {
  if (row.status !== 'running') {
    return false;
  }

  if (!row.lease_expires_at) {
    return true;
  }

  return !isLeaseExpired(row.lease_expires_at);
}

type PrismaTx = Omit<typeof prisma, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

async function withTypeLock<T>(
  type: OrchestrationJobType,
  callback: (tx: PrismaTx) => Promise<T>
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${type}))`;
    return callback(tx);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
}

async function upsertOrchestrationJob(
  tx: PrismaTx,
  params: {
    type: OrchestrationJobType;
    userId: string;
    payload: unknown;
    dedupeKey?: string;
    maxAttempts: number;
  }
): Promise<OrchestrationJobRow> {
  const jobId = createRequestId(`job_${params.type}`);
  const rows = await tx.$queryRaw<OrchestrationJobRow[]>`
    INSERT INTO orchestration_job (id, type, user_id, status, dedupe_key, payload, max_attempts, next_attempt_at)
    VALUES (${jobId}, ${params.type}, ${params.userId}, 'queued', ${params.dedupeKey ?? null}, ${safeJson(params.payload)}::jsonb, ${params.maxAttempts}, NOW())
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
    RETURNING id, type, user_id, status, payload, result, error, attempts, max_attempts, next_attempt_at, lease_expires_at, created_at`;

  return rows[0];
}

async function countRunningJobsWithTx(
  tx: PrismaTx,
  type: OrchestrationJobType
): Promise<number> {
  const rows = await tx.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*) AS count
    FROM orchestration_job
    WHERE type = ${type}
      AND status = 'running'
      AND lease_expires_at > NOW()`;

  return Number(rows[0]?.count ?? 0);
}

async function startOrchestrationJobWithTx(
  tx: PrismaTx,
  params: {
    jobId: string;
    leaseOwner?: string;
    leaseMs?: number;
  }
): Promise<OrchestrationJobRow | null> {
  const leaseOwner = params.leaseOwner ?? createRequestId('lease');
  const leaseMs = String(params.leaseMs ?? DEFAULT_LEASE_MS);

  const rows = await tx.$queryRaw<OrchestrationJobRow[]>`
    UPDATE orchestration_job
    SET
      status = 'running',
      attempts = attempts + 1,
      lease_owner = ${leaseOwner},
      lease_expires_at = NOW() + (${leaseMs} || ' milliseconds')::interval,
      last_heartbeat_at = NOW(),
      updated_at = NOW()
    WHERE id = ${params.jobId}
      AND attempts < max_attempts
      AND (
        (status = 'queued' AND (next_attempt_at IS NULL OR next_attempt_at <= NOW()))
        OR (status = 'running' AND (lease_expires_at IS NULL OR lease_expires_at < NOW()))
      )
    RETURNING id, type, user_id, status, payload, result, error, attempts, max_attempts, next_attempt_at, lease_expires_at, created_at`;

  return rows[0] ?? null;
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
  return withTypeLock(params.type, async (tx) => {
    if (params.persistIfAtCapacity === false) {
      const runningJobs = await countRunningJobsWithTx(tx, params.type);
      if (runningJobs >= params.maxRunning) {
        logInfo({
          event: 'orchestration_job_enqueue_capacity_blocked',
          jobType: params.type,
          userId: params.userId,
          maxRunning: params.maxRunning,
          runningJobs,
        });
        return { job: null, started: false, atCapacity: true };
      }
    }

    const queuedJob = await upsertOrchestrationJob(tx, {
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
      return { job: queuedRecord, started: false, atCapacity: false };
    }

    const runningJobs = await countRunningJobsWithTx(tx, params.type);
    if (runningJobs >= params.maxRunning) {
      logInfo({
        event: 'orchestration_job_queue_waiting_for_capacity',
        jobId: queuedRecord.id,
        jobType: queuedRecord.type,
        userId: queuedRecord.userId,
        runningJobs,
        maxRunning: params.maxRunning,
      });
      return { job: queuedRecord, started: false, atCapacity: true };
    }

    const startedJob = await startOrchestrationJobWithTx(tx, {
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
  return withTypeLock(params.type, async (tx) => {
    await tx.$executeRaw`
      UPDATE orchestration_job
      SET
        status = 'failed',
        error = COALESCE(error, 'Lease expired after max retry attempts'),
        lease_owner = NULL,
        lease_expires_at = NULL,
        next_attempt_at = NULL,
        updated_at = NOW()
      WHERE type = ${params.type}
        AND status = 'running'
        AND lease_expires_at < NOW()
        AND attempts >= max_attempts`;

    const runningJobs = await countRunningJobsWithTx(tx, params.type);
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
    const leaseMs = String(params.leaseMs ?? DEFAULT_LEASE_MS);
    const rows = await tx.$queryRaw<OrchestrationJobRow[]>`
      WITH next_job AS (
        SELECT id
        FROM orchestration_job
        WHERE type = ${params.type}
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
        lease_owner = ${owner},
        lease_expires_at = NOW() + (${leaseMs} || ' milliseconds')::interval,
        last_heartbeat_at = NOW(),
        updated_at = NOW()
      WHERE id IN (SELECT id FROM next_job)
      RETURNING id, type, user_id, status, payload, result, error, attempts, max_attempts, next_attempt_at, lease_expires_at, created_at`;

    if (rows[0]) {
      const claimedRecord = mapOrchestrationJobRow(rows[0]);
      logOrchestrationJobStart({
        jobId: claimedRecord.id,
        jobType: claimedRecord.type,
        userId: claimedRecord.userId,
        attempts: claimedRecord.attempts,
        attachmentId: extractAttachmentId(claimedRecord.payload),
      });
    }

    return {
      job: rows[0] ? mapOrchestrationJobRow(rows[0]) : null,
      atCapacity: false,
    };
  });
}

export async function heartbeatOrchestrationJobLease(params: {
  jobId: string;
  leaseOwner?: string;
  leaseMs?: number;
}): Promise<boolean> {
  const leaseMs = String(params.leaseMs ?? DEFAULT_LEASE_MS);
  const hasOwnerConstraint = Boolean(params.leaseOwner);

  const result = await prisma.$executeRaw`
    UPDATE orchestration_job
    SET
      lease_expires_at = NOW() + (${leaseMs} || ' milliseconds')::interval,
      last_heartbeat_at = NOW(),
      updated_at = NOW()
    WHERE id = ${params.jobId}
      AND status = 'running'
      AND (${hasOwnerConstraint}::boolean = FALSE OR lease_owner = ${params.leaseOwner ?? null})`;

  return result > 0;
}

export async function resolveOrchestrationJobRun(params: {
  jobId: string;
  leaseOwner?: string;
  succeeded: boolean;
  result?: unknown;
  error?: string;
  retryable?: boolean;
  retryAt?: Date;
}): Promise<{ status: OrchestrationJobStatus; retried: boolean } | null> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<OrchestrationJobRow[]>`
      SELECT
        id, type, user_id, status, payload, result, error,
        attempts, max_attempts, lease_owner, next_attempt_at, lease_expires_at, created_at
      FROM orchestration_job
      WHERE id = ${params.jobId}
      FOR UPDATE`;

    const existing = rows[0];
    if (!existing) {
      return null;
    }

    if (
      existing.status !== 'running' ||
      (params.leaseOwner && existing.lease_owner !== params.leaseOwner)
    ) {
      logWarn({
        event: 'orchestration_job_stale_resolution_ignored',
        jobId: existing.id,
        jobType: existing.type,
        userId: existing.user_id,
        status: existing.status,
        expectedLeaseOwner: params.leaseOwner,
        actualLeaseOwner: existing.lease_owner,
      });
      return null;
    }

    if (params.succeeded) {
      await tx.$executeRaw`
        UPDATE orchestration_job
        SET
          status = 'completed',
          result = ${safeJson(params.result)}::jsonb,
          error = NULL,
          lease_owner = NULL,
          lease_expires_at = NULL,
          next_attempt_at = NULL,
          updated_at = NOW()
        WHERE id = ${params.jobId}`;

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
      await tx.$executeRaw`
        UPDATE orchestration_job
        SET
          status = 'queued',
          result = ${safeJson(params.result)}::jsonb,
          error = ${params.error ?? 'Job failed'},
          lease_owner = NULL,
          lease_expires_at = NULL,
          next_attempt_at = ${retryAt},
          updated_at = NOW()
        WHERE id = ${params.jobId}`;

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

    await tx.$executeRaw`
      UPDATE orchestration_job
      SET
        status = 'failed',
        result = ${safeJson(params.result)}::jsonb,
        error = ${params.error ?? 'Job failed'},
        lease_owner = NULL,
        lease_expires_at = NULL,
        next_attempt_at = NULL,
        updated_at = NOW()
      WHERE id = ${params.jobId}`;

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
  });
}
