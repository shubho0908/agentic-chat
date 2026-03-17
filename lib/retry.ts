interface RetryOptions {
  retries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  jitterMs?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
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
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', onAbort);
      reject(new Error('Operation aborted'));
    };

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

async function runWithTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs?: number,
  signal?: AbortSignal
): Promise<T> {
  if (!timeoutMs || timeoutMs <= 0) {
    return operation();
  }

  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);

  const abortPromise = new Promise<never>((_, reject) => {
    const onAbort = () => reject(new Error('Operation timed out'));
    timeoutController.signal.addEventListener('abort', onAbort, { once: true });
    signal?.addEventListener('abort', onAbort, { once: true });
  });

  try {
    return await Promise.race([operation(), abortPromise]);
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function withRetry<T>(
  operation: () => Promise<T>,
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

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (signal?.aborted) {
      throw new Error('Operation aborted');
    }

    try {
      return await runWithTimeout(operation, timeoutMs, signal);
    } catch (error) {
      lastError = error;

      if (attempt === retries || !shouldRetry(error, attempt + 1)) {
        throw error;
      }

      const backoffMs = Math.min(initialDelayMs * 2 ** attempt, maxDelayMs);
      const jitter = Math.floor(Math.random() * Math.max(0, jitterMs));
      await sleep(backoffMs, signal);
      if (jitter > 0) {
        await sleep(jitter, signal);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Retry operation failed');
}
