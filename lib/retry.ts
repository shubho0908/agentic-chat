interface RetryOptions {
  retries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  signal?: AbortSignal;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
}

function defaultShouldRetry(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('rate limit') ||
    message.includes('temporarily unavailable') ||
    message.includes('econnreset') ||
    message.includes('socket hang up') ||
    message.includes('503') ||
    message.includes('502')
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

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    retries = 2,
    initialDelayMs = 250,
    maxDelayMs = 1500,
    signal,
    shouldRetry = defaultShouldRetry,
  } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (signal?.aborted) {
      throw new Error('Operation aborted');
    }

    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt === retries || !shouldRetry(error, attempt + 1)) {
        throw error;
      }

      const backoffMs = Math.min(initialDelayMs * 2 ** attempt, maxDelayMs);
      await sleep(backoffMs, signal);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Retry operation failed');
}
