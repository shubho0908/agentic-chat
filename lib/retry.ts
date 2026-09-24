interface RetryOptions {
  retries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  jitterMs?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
}

function isRateLimitError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as Error & { status?: number; code?: string | number; cause?: { status?: number } };
  const status = candidate.status ?? candidate.cause?.status;
  if (status === 429) return true;
  const msg = candidate.message?.toLowerCase() ?? "";
  return msg.includes("rate limit") || msg.includes("too many requests");
}

function getRetryAfterMs(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const candidate = error as { headers?: { get?: (k: string) => string | null }; response?: { headers?: { get?: (k: string) => string | null } } };
  const raw = candidate.headers?.get?.("retry-after") ?? candidate.response?.headers?.get?.("retry-after");
  if (!raw) return null;
  const seconds = Number(raw);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null;
}

type AbortableOperation<T> = (signal?: AbortSignal) => Promise<T>;

const ABORTED_MESSAGE = 'Operation aborted';

function createAbortError(message: string): Error {
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}

/** Aborts from any layer: our own AbortError, a native DOMException, or a
 * transport error that only says so in its message. */
export function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { name?: unknown; message?: unknown };
  return (
    candidate.name === 'AbortError' ||
    (typeof candidate.message === 'string' && /abort/i.test(candidate.message))
  );
}

function readAbortReasonMessage(reason: unknown): string | null {
  if (!reason || typeof reason !== 'object') return null;
  const candidate = reason as { name?: unknown; message?: unknown };
  return candidate.name === 'AbortError' && typeof candidate.message === 'string' && candidate.message
    ? candidate.message
    : null;
}

/** AbortError that keeps the signal's own reason. Cancellation is classified by
 * `name` (and reported by `message`), so the reason travels as the message and
 * as `cause` instead of being flattened into a generic string. */
function resolveAbortReason(signal?: AbortSignal): Error {
  const reason: unknown = signal?.reason;
  if (reason instanceof Error && reason.name === 'AbortError') return reason;

  const detail =
    reason instanceof Error ? reason.message : readAbortReasonMessage(reason);
  const error = createAbortError(detail ?? ABORTED_MESSAGE);
  if (reason && typeof reason === 'object') error.cause = reason;
  return error;
}

function defaultShouldRetry(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const candidate = error as Error & {
    status?: number;
    code?: string | number;
    cause?: { code?: string | number; status?: number };
  };
  const message = candidate.message?.toLowerCase() ?? '';
  const status = candidate.status ?? candidate.cause?.status;
  const code = String(candidate.code ?? candidate.cause?.code ?? '').toLowerCase();

  return (
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('rate limit') ||
    message.includes('temporarily unavailable') ||
    message.includes('econnreset') ||
    message.includes('socket hang up') ||
    message.includes('503') ||
    message.includes('502') ||
    code === 'etimedout' ||
    code === 'econnreset' ||
    code === 'econrefused' ||
    code === 'eai_again' ||
    status === 408 ||
    status === 409 ||
    status === 425 ||
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504
  );
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(resolveAbortReason(signal));
  }

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', onAbort);
      reject(resolveAbortReason(signal));
    };

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** Races the operation against its cancellation sources, so a caller's signal is
 * a hard bound even if the operation ignores it. */
async function runWithTimeout<T>(
  operation: AbortableOperation<T>,
  timeoutMs?: number,
  signal?: AbortSignal
): Promise<T> {
  const hasTimeout = Boolean(timeoutMs && timeoutMs > 0);
  if (!hasTimeout && !signal) {
    return operation();
  }

  if (signal?.aborted) {
    throw resolveAbortReason(signal);
  }

  const timeoutController = new AbortController();
  const timeoutId = hasTimeout
    ? setTimeout(() => {
        timeoutController.abort(createAbortError('Operation timed out'));
      }, timeoutMs)
    : undefined;
  const combinedController = new AbortController();

  const abortCombined = (reason: Error) => {
    if (!combinedController.signal.aborted) {
      combinedController.abort(reason);
    }
  };

  const onTimeoutAbort = () => {
    abortCombined(resolveAbortReason(timeoutController.signal));
  };
  const onSignalAbort = () => {
    abortCombined(resolveAbortReason(signal));
  };

  if (hasTimeout) {
    timeoutController.signal.addEventListener('abort', onTimeoutAbort, { once: true });
  }
  signal?.addEventListener('abort', onSignalAbort, { once: true });

  const abortPromise = new Promise<never>((_, reject) => {
    const onAbort = () => {
      combinedController.signal.removeEventListener('abort', onAbort);
      reject(resolveAbortReason(combinedController.signal));
    };

    combinedController.signal.addEventListener('abort', onAbort, { once: true });
  });

  try {
    return await Promise.race([operation(combinedController.signal), abortPromise]);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
    timeoutController.signal.removeEventListener('abort', onTimeoutAbort);
    signal?.removeEventListener('abort', onSignalAbort);
  }
}

export async function withRetry<T>(
  operation: AbortableOperation<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    retries = 2,
    initialDelayMs = 250,
    maxDelayMs = 1500,
    jitterMs = 150,
    timeoutMs,
    signal,
    shouldRetry = defaultShouldRetry,
  } = options;

  const attempt = async (index: number): Promise<T> => {
    if (signal?.aborted) {
      throw resolveAbortReason(signal);
    }

    try {
      return await runWithTimeout(operation, timeoutMs, signal);
    } catch (error) {
      if (index >= retries || !shouldRetry(error, index + 1)) {
        throw error;
      }

      // An aborted signal means the caller's budget is gone or the request was
      // cancelled: retrying is dead work, and the backoff sleep would replace
      // the real abort reason with a generic one.
      if (signal?.aborted) {
        throw resolveAbortReason(signal);
      }

      const rateLimited = isRateLimitError(error);
      const retryAfterMs = rateLimited ? getRetryAfterMs(error) : null;
      const baseBackoff = rateLimited
        ? retryAfterMs ?? Math.min(initialDelayMs * 4 ** index, 10_000)
        : Math.min(initialDelayMs * 2 ** index, maxDelayMs);
      const jitter = Math.floor(Math.random() * Math.max(0, jitterMs));
      await sleep(baseBackoff + jitter, signal);
      return attempt(index + 1);
    }
  };

  return attempt(0);
}
