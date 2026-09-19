/** Bounded fan-out with fail-fast cancellation: the first rejection aborts
 * every sibling in flight and stops new work, so an abandoned request never
 * keeps hitting the provider behind the caller's fallback. Caller-cancelled
 * evaluations do not count against the circuit breaker (see the Jev client),
 * so one failing checkpoint call cannot poison provider-health tracking with
 * the siblings it cancelled. */
export async function mapWithConcurrencyLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, signal: AbortSignal) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  const abortController = new AbortController();
  let next = 0;
  let failed = false;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (!failed && next < items.length) {
        const index = next++;
        try {
          results[index] = await fn(items[index], abortController.signal);
        } catch (error) {
          failed = true;
          abortController.abort(
            error instanceof Error ? error : new Error(String(error)),
          );
          throw error;
        }
      }
    },
  );
  await Promise.all(workers);
  return results;
}
