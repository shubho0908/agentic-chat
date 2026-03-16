import { assertSafePublicUrl } from './ssrf';
import { withRetry } from '@/lib/retry';

interface SafeFetchOptions extends RequestInit {
  timeoutMs?: number;
  retries?: number;
  maxRedirects?: number;
  allowHosts?: string[];
}

function mergeHeaders(headers?: HeadersInit): Headers {
  return new Headers(headers);
}

export async function safeFetch(
  input: string | URL,
  options: SafeFetchOptions = {}
): Promise<Response> {
  const {
    timeoutMs = 10000,
    retries = 2,
    maxRedirects = 2,
    allowHosts,
    signal,
    headers,
    ...init
  } = options;
  const normalizedSignal = signal ?? undefined;

  let currentUrl = await assertSafePublicUrl(input, { allowHosts });

  const execute = async (): Promise<Response> => {
    let redirectCount = 0;

    while (true) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const abortListener = () => controller.abort();
      normalizedSignal?.addEventListener('abort', abortListener, { once: true });

      try {
        const response = await fetch(currentUrl, {
          ...init,
          headers: mergeHeaders(headers),
          redirect: 'manual',
          signal: controller.signal,
        });

        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get('location');
          if (!location) {
            throw new Error('Redirect response missing location header');
          }

          if (redirectCount >= maxRedirects) {
            throw new Error('Too many redirects');
          }

          redirectCount += 1;
          currentUrl = await assertSafePublicUrl(new URL(location, currentUrl), { allowHosts });
          continue;
        }

        return response;
      } finally {
        clearTimeout(timeoutId);
        normalizedSignal?.removeEventListener('abort', abortListener);
      }
    }
  };

  return withRetry(execute, {
    retries,
    signal: normalizedSignal,
  });
}
