export const DEFAULT_JOB_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_BASE_DELAY_MS = 2_000;
const DEFAULT_RETRY_MAX_DELAY_MS = 60_000;

interface RetryDecisionInput {
  attempts: number;
  maxAttempts: number;
  retryable: boolean;
}

export function shouldRetryJob(input: RetryDecisionInput): boolean {
  return input.retryable && input.attempts < input.maxAttempts;
}

export function computeRetryBackoffMs(
  attempts: number,
  baseDelayMs: number = DEFAULT_RETRY_BASE_DELAY_MS,
  maxDelayMs: number = DEFAULT_RETRY_MAX_DELAY_MS
): number {
  const safeAttempts = Math.max(1, Math.floor(attempts));
  const rawDelay = baseDelayMs * Math.pow(2, safeAttempts - 1);
  return Math.min(rawDelay, maxDelayMs);
}

export function computeNextRetryAt(
  attempts: number,
  nowMs: number = Date.now()
): Date {
  return new Date(nowMs + computeRetryBackoffMs(attempts));
}

export function isLeaseExpired(
  leaseExpiresAt: Date | string | null | undefined,
  nowMs: number = Date.now()
): boolean {
  if (!leaseExpiresAt) {
    return false;
  }

  return new Date(leaseExpiresAt).getTime() <= nowMs;
}

const NON_RETRYABLE_DOCUMENT_ERROR_PATTERNS = [
  'unsupported file type',
  'unauthorized',
  'attachment not found',
  'invalid job payload',
  'missing attachmentid payload',
];

export function isRetryableDocumentError(errorMessage?: string): boolean {
  if (!errorMessage) {
    return true;
  }

  const normalized = errorMessage.toLowerCase();
  return !NON_RETRYABLE_DOCUMENT_ERROR_PATTERNS.some((pattern) =>
    normalized.includes(pattern)
  );
}
