import { processDocument } from "@/lib/rag/indexing/processor";
import {
  claimNextQueuedJobWithinCapacity,
  enqueueOrStartJobWithinCapacity,
  heartbeatOrchestrationJobLease,
  resolveOrchestrationJobRun,
} from "./store";
import {
  DEFAULT_JOB_MAX_ATTEMPTS,
  isRetryableDocumentError,
} from "./retryPolicy";
import {
  logError,
  logInfo,
  logMetric,
  logWarn,
  measureLatencyMs,
} from "@/lib/observability";

const MAX_CONCURRENT_DOCUMENT_JOBS = 3;
const DOCUMENT_JOB_LEASE_MS = 15 * 60 * 1000;
const DOCUMENT_JOB_HEARTBEAT_MS = 30 * 1000;
const DEFAULT_DRAIN_BATCH_SIZE = 5;
const MAX_DRAIN_BATCH_SIZE = 25;

type ClaimedDocumentJob = {
  id: string;
  userId: string;
  payload: unknown;
};

interface DrainQueuedDocumentJobsResult {
  processed: number;
  completed: number;
  failed: number;
  requeued: number;
  atCapacity: boolean;
}

interface RunClaimedDocumentJobResult {
  success: boolean;
  retried: boolean;
  error?: string;
  stats?: {
    chunks: number;
    tokens: number;
  };
}

function clampDrainBatchSize(maxJobs: number | undefined): number {
  const safeValue = Number.isFinite(maxJobs)
    ? Number(maxJobs)
    : DEFAULT_DRAIN_BATCH_SIZE;
  const normalized = Math.max(1, Math.floor(safeValue));
  return Math.min(normalized, MAX_DRAIN_BATCH_SIZE);
}

function extractAttachmentId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const value = (payload as { attachmentId?: unknown }).attachmentId;
  return typeof value === "string" && value.length > 0 ? value : null;
}

async function runClaimedDocumentJob(
  job: ClaimedDocumentJob,
  leaseOwner: string,
): Promise<RunClaimedDocumentJobResult> {
  const runStartedAt = Date.now();
  const attachmentId = extractAttachmentId(job.payload);
  if (!attachmentId) {
    logError({
      event: "document_job_invalid_payload",
      jobId: job.id,
      userId: job.userId,
      error: "Missing attachmentId payload",
    });
    await resolveOrchestrationJobRun({
      jobId: job.id,
      succeeded: false,
      error: "Missing attachmentId payload",
      retryable: false,
    });
    return {
      success: false,
      retried: false,
      error: "Missing attachmentId payload",
    };
  }

  const heartbeat = setInterval(() => {
    void heartbeatOrchestrationJobLease({
      jobId: job.id,
      leaseOwner,
      leaseMs: DOCUMENT_JOB_LEASE_MS,
    }).catch((error) => {
      logWarn({
        event: "document_job_lease_heartbeat_failed",
        jobId: job.id,
        userId: job.userId,
        attachmentId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }, DOCUMENT_JOB_HEARTBEAT_MS);
  heartbeat.unref?.();

  try {
    const result = await processDocument(attachmentId, job.userId);
    const retryable = !result.success && isRetryableDocumentError(result.error);
    const resolution = await resolveOrchestrationJobRun({
      jobId: job.id,
      succeeded: result.success,
      result,
      error: result.error,
      retryable,
    });

    logMetric({
      metric: "document_job_run_latency_ms",
      value: measureLatencyMs(runStartedAt),
      unit: "ms",
      userId: job.userId,
      jobId: job.id,
      attachmentId,
      success: result.success,
      retried: resolution?.retried ?? false,
    });

    return {
      success: result.success,
      retried: resolution?.retried ?? false,
      error: result.error,
      stats: result.stats,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const resolution = await resolveOrchestrationJobRun({
      jobId: job.id,
      succeeded: false,
      error: errorMessage,
      retryable: isRetryableDocumentError(errorMessage),
    });

    logMetric({
      metric: "document_job_run_latency_ms",
      value: measureLatencyMs(runStartedAt),
      unit: "ms",
      userId: job.userId,
      jobId: job.id,
      attachmentId,
      success: false,
      retried: resolution?.retried ?? false,
    });

    return {
      success: false,
      retried: resolution?.retried ?? false,
      error: errorMessage,
    };
  } finally {
    clearInterval(heartbeat);
  }
}

export async function drainQueuedDocumentJobs(options?: {
  maxJobs?: number;
  leaseOwner?: string;
}): Promise<DrainQueuedDocumentJobsResult> {
  const drainStartedAt = Date.now();
  const maxJobs = clampDrainBatchSize(options?.maxJobs);
  const baseLeaseOwner =
    options?.leaseOwner && options.leaseOwner.length > 0
      ? options.leaseOwner
      : "document-job-drain";

  const summary: DrainQueuedDocumentJobsResult = {
    processed: 0,
    completed: 0,
    failed: 0,
    requeued: 0,
    atCapacity: false,
  };

  for (let index = 0; index < maxJobs; index += 1) {
    const leaseOwner = `${baseLeaseOwner}-${Date.now()}-${index}`;
    const claimed = await claimNextQueuedJobWithinCapacity({
      type: "document_process",
      maxRunning: MAX_CONCURRENT_DOCUMENT_JOBS,
      leaseOwner,
      leaseMs: DOCUMENT_JOB_LEASE_MS,
    });

    if (claimed.atCapacity) {
      summary.atCapacity = true;
      break;
    }

    if (!claimed.job) {
      break;
    }

    const result = await runClaimedDocumentJob(
      {
        id: claimed.job.id,
        userId: claimed.job.userId,
        payload: claimed.job.payload,
      },
      leaseOwner,
    );

    summary.processed += 1;
    if (result.retried) {
      summary.requeued += 1;
    } else if (result.success) {
      summary.completed += 1;
    } else {
      summary.failed += 1;
    }
  }

  logInfo({
    event: "document_job_drain_finished",
    maxJobs,
    ...summary,
    latencyMs: measureLatencyMs(drainStartedAt),
  });
  logMetric({
    metric: "document_job_drain_latency_ms",
    value: measureLatencyMs(drainStartedAt),
    unit: "ms",
    maxJobs,
    processed: summary.processed,
    completed: summary.completed,
    failed: summary.failed,
    requeued: summary.requeued,
    atCapacity: summary.atCapacity,
  });

  return summary;
}

export async function runOrQueueDocumentProcessingJob(
  attachmentId: string,
  userId: string,
): Promise<{
  jobId: string;
  queued: boolean;
  success?: boolean;
  error?: string;
  stats?: {
    chunks: number;
    tokens: number;
  };
}> {
  const leaseOwner = `attachment_${attachmentId}`;
  const reservation = await enqueueOrStartJobWithinCapacity({
    type: "document_process",
    userId,
    payload: { attachmentId },
    dedupeKey: attachmentId,
    maxRunning: MAX_CONCURRENT_DOCUMENT_JOBS,
    maxAttempts: DEFAULT_JOB_MAX_ATTEMPTS,
    leaseOwner,
    leaseMs: DOCUMENT_JOB_LEASE_MS,
  });
  const { job, started } = reservation;

  if (!job) {
    throw new Error("Document processing job reservation failed");
  }

  logInfo({
    event: "document_job_reserved",
    jobId: job.id,
    userId,
    attachmentId,
    started,
    atCapacity: reservation.atCapacity,
    currentStatus: job.status,
  });

  if (!started) {
    const queued = job.status === "queued" || job.status === "running";

    await drainQueuedDocumentJobs({
      maxJobs: DEFAULT_DRAIN_BATCH_SIZE,
      leaseOwner: `document-job-drain-${Date.now()}`,
    });

    return {
      jobId: job.id,
      queued,
      success: job.status === "completed",
      error: job.error ?? undefined,
    };
  }

  const result = await runClaimedDocumentJob(
    {
      id: job.id,
      userId,
      payload: { attachmentId },
    },
    leaseOwner,
  );

  await drainQueuedDocumentJobs({
    maxJobs: DEFAULT_DRAIN_BATCH_SIZE,
    leaseOwner: "document-job-drain",
  });

  return {
    jobId: job.id,
    queued: result.retried,
    success: result.success,
    error: result.error,
    stats: result.stats,
  };
}
