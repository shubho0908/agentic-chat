import { Agent, fetch as undiciFetch } from 'undici';
import { assertSafePublicUrl, type SafeResolvedUrl } from './ssrf';
import { withRetry } from '@/lib/retry';

interface SafeFetchOptions extends RequestInit {
  timeoutMs?: number;
  retries?: number;
  maxRedirects?: number;
  allowHosts?: string[];
  maxResponseBytes?: number;
}

function normalizeHeaders(headers?: HeadersInit): Headers {
  return new Headers(headers);
}

function cloneSafeResolvedUrl(target: SafeResolvedUrl): SafeResolvedUrl {
  return {
    url: new URL(target.url.toString()),
    hostname: target.hostname,
    resolvedAddresses: target.resolvedAddresses.map((address) => ({ ...address })),
  };
}

function selectResolvedAddress(
  addresses: SafeResolvedUrl['resolvedAddresses'],
  family?: number | string
): SafeResolvedUrl['resolvedAddresses'][number] {
  const normalizedFamily =
    family === 'IPv4' ? 4 : family === 'IPv6' ? 6 : family;

  return addresses.find((address) => normalizedFamily === undefined || address.family === normalizedFamily) ?? addresses[0];
}

function createPinnedDispatcher(target: SafeResolvedUrl): Agent {
  return new Agent({
    connect: {
      lookup(hostname, options, callback) {
        if (hostname.toLowerCase() !== target.hostname) {
          callback(new Error(`Unexpected lookup hostname: ${hostname}`), '' as never, 0 as never);
          return;
        }

        if (options.all) {
          callback(
            null,
            target.resolvedAddresses.map((address) => ({
              address: address.address,
              family: address.family,
            }))
          );
          return;
        }

        const resolvedAddress = selectResolvedAddress(target.resolvedAddresses, options.family);
        if (!resolvedAddress) {
          callback(new Error(`No validated address available for ${target.hostname}`), '' as never, 0 as never);
          return;
        }

        callback(null, resolvedAddress.address, resolvedAddress.family);
      },
    },
  });
}

async function readResponseBody(
  response: Awaited<ReturnType<typeof undiciFetch>>,
  maxResponseBytes?: number
): Promise<Uint8Array> {
  const contentLength = Number(response.headers.get('content-length'));
  if (
    maxResponseBytes !== undefined &&
    Number.isFinite(contentLength) &&
    contentLength > maxResponseBytes
  ) {
    throw new Error(`Response too large: ${contentLength} bytes`);
  }

  if (maxResponseBytes === undefined) {
    return new Uint8Array(await response.arrayBuffer());
  }

  if (!response.body) {
    return new Uint8Array();
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      totalBytes += value.byteLength;
      if (totalBytes > maxResponseBytes) {
        throw new Error(`Response too large: exceeded ${maxResponseBytes} bytes`);
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return body;
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
    maxResponseBytes,
    signal,
    headers,
    ...init
  } = options;
  const normalizedSignal = signal ?? undefined;
  const initialTarget = await assertSafePublicUrl(input, { allowHosts });

  const execute = async (attemptSignal?: AbortSignal): Promise<Response> => {
    let redirectCount = 0;
    let currentTarget = cloneSafeResolvedUrl(initialTarget);

    while (true) {
      const dispatcher = createPinnedDispatcher(currentTarget);

      try {
        const response = await undiciFetch(currentTarget.url.toString(), {
          ...init,
          headers: normalizeHeaders(headers),
          redirect: 'manual',
          signal: attemptSignal,
          dispatcher,
        } as Parameters<typeof undiciFetch>[1]);

        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get('location');
          if (!location) {
            throw new Error('Redirect response missing location header');
          }

          if (redirectCount >= maxRedirects) {
            throw new Error('Too many redirects');
          }

          redirectCount += 1;
          await response.body?.cancel().catch(() => undefined);
          currentTarget = await assertSafePublicUrl(new URL(location, currentTarget.url), { allowHosts });
          continue;
        }

        const body = await readResponseBody(response, maxResponseBytes);
        return new Response(new Blob([Buffer.from(body)]), {
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries()),
        });
      } finally {
        await dispatcher.close();
      }
    }
  };

  return withRetry(execute, {
    retries,
    signal: normalizedSignal,
    timeoutMs,
  });
}
