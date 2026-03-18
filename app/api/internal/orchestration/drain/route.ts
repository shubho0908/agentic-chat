import { NextRequest } from 'next/server';
import { jsonResponse, errorResponse } from '@/lib/apiUtils';
import { HTTP_STATUS } from '@/constants/errors';
import {
  drainQueuedDocumentJobs,
} from '@/lib/orchestration/documentJobs';
import { logWarn } from '@/lib/observability';

const DEFAULT_DRAIN_BATCH_SIZE = 5;
const MAX_DRAIN_BATCH_SIZE = 25;

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isAuthorized(request: NextRequest): boolean {
  const expectedSecret = process.env.ORCHESTRATION_DRAIN_SECRET || process.env.CRON_SECRET;
  if (!expectedSecret) {
    return false;
  }

  const provided = request.headers.get('x-orchestration-secret');
  const authorization = request.headers.get('authorization');
  const bearerToken = authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : null;

  return provided === expectedSecret || bearerToken === expectedSecret;
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return errorResponse('Unauthorized', undefined, HTTP_STATUS.UNAUTHORIZED);
  }

  let maxJobs = DEFAULT_DRAIN_BATCH_SIZE;
  const hasBody = request.headers.get('content-length') !== '0';
  try {
    if (hasBody) {
      const body = await request.json() as { maxJobs?: unknown };
      if (typeof body.maxJobs === 'number' && Number.isFinite(body.maxJobs)) {
        maxJobs = Math.min(
          MAX_DRAIN_BATCH_SIZE,
          Math.max(1, Math.floor(body.maxJobs))
        );
      }
    }
  } catch (error) {
    logWarn({
      event: 'document_job_drain_invalid_body',
      error: error instanceof Error ? error.message : String(error),
    });

    if (hasBody) {
      return errorResponse('Invalid JSON body', undefined, HTTP_STATUS.BAD_REQUEST);
    }
  }

  const result = await drainQueuedDocumentJobs({
    maxJobs,
    leaseOwner: 'orchestration-drain',
  });

  if (result.atCapacity && result.processed === 0) {
    return jsonResponse({
      success: true,
      message: 'Document workers are already at capacity',
      processed: 0,
    });
  }

  if (result.processed === 0) {
    return jsonResponse({
      success: true,
      message: 'No queued document jobs',
      processed: 0,
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
  });
}
