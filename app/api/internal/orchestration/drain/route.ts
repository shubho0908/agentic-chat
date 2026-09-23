import { NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { jsonResponse, errorResponse } from '@/lib/apiUtils';
import { HTTP_STATUS } from '@/constants/errors';
import {
  drainQueuedDocumentJobs,
} from '@/lib/orchestration/documentJobs';
import { logWarn } from '@/lib/observability';
import { isRecord } from '@/lib/typeGuards';
import { pruneCheckpointsOnSchedule } from '@/lib/orchestrator/checkpointPrune';

const DEFAULT_DRAIN_BATCH_SIZE = 5;
const MAX_DRAIN_BATCH_SIZE = 25;
const DRAIN_ROUTE_BUDGET_MS = 270_000;

export const dynamic = 'force-dynamic';

function secretEquals(provided: string | null, expected: string): boolean {
  if (!provided || provided.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

function isAuthorized(request: NextRequest): boolean {
  const expectedSecrets = [
    process.env.ORCHESTRATION_DRAIN_SECRET,
    process.env.CRON_SECRET,
  ].filter((secret): secret is string => Boolean(secret));
  if (expectedSecrets.length === 0) {
    return false;
  }

  const provided = request.headers.get('x-orchestration-secret');
  const authorization = request.headers.get('authorization');
  const bearerToken = authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : null;

  return expectedSecrets.some(
    (expectedSecret) =>
      secretEquals(provided, expectedSecret) || secretEquals(bearerToken, expectedSecret)
  );
}

function normalizeMaxJobs(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_DRAIN_BATCH_SIZE;
  }

  return Math.min(
    MAX_DRAIN_BATCH_SIZE,
    Math.max(1, Math.floor(value))
  );
}

async function readMaxJobs(request: NextRequest): Promise<
  { success: true; maxJobs: number } | { success: false; error: string }
> {
  const rawBody = await request.text();
  if (!rawBody.trim()) {
    return { success: true, maxJobs: DEFAULT_DRAIN_BATCH_SIZE };
  }

  try {
    const parsed = JSON.parse(rawBody);
    if (!isRecord(parsed)) {
      return { success: false, error: 'JSON body must be an object' };
    }

    return { success: true, maxJobs: normalizeMaxJobs(parsed.maxJobs) };
  } catch (error) {
    logWarn({
      event: 'document_job_drain_invalid_body',
      error: error instanceof Error ? error.message : String(error),
    });
    return { success: false, error: 'Invalid JSON body' };
  }
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  if (!isAuthorized(request)) {
    return errorResponse('Unauthorized', undefined, HTTP_STATUS.UNAUTHORIZED);
  }

  const parsedBody = await readMaxJobs(request);
  if (!parsedBody.success) {
    return errorResponse(parsedBody.error, undefined, HTTP_STATUS.BAD_REQUEST);
  }

  const checkpointPrune = await pruneCheckpointsOnSchedule({
    deadline: startedAt + DRAIN_ROUTE_BUDGET_MS,
  });
  const result = await drainQueuedDocumentJobs({
    maxJobs: parsedBody.maxJobs,
    leaseOwner: 'orchestration-drain',
  });

  if (result.atCapacity && result.processed === 0) {
    return jsonResponse({
      success: true,
      message: 'Document workers are already at capacity',
      processed: 0,
      checkpointPrune,
    });
  }

  if (result.processed === 0) {
    return jsonResponse({
      success: true,
      message: 'No queued document jobs',
      processed: 0,
      checkpointPrune,
    });
  }

  return jsonResponse({
    success: result.failed === 0,
    processed: result.processed,
    completed: result.completed,
    failed: result.failed,
    requeued: result.requeued,
    atCapacity: result.atCapacity,
    result,
    checkpointPrune,
  });
}

export const GET = POST;
