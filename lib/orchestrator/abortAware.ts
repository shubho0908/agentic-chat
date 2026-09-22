/**
 * Bounds an await that cannot receive the work signal itself (Prisma queries,
 * checkpointer reads, third-party SDK calls). Without this, a stalled
 * operation parks execution past the stream deadline: the abort checks are
 * never reached, heartbeats keep the client watchdog quiet, and the platform
 * hard-kills the request with no client-visible error. Rejecting here lets
 * the caller's normal abort/deadline path emit the terminal SSE error
 * instead. The underlying promise is not cancelled; its late outcome is
 * discarded and its late rejection is swallowed so it never surfaces as an
 * unhandled rejection.
 */
export function abortAware<T>(
  operation: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  if (signal.aborted) {
    operation.catch(() => undefined);
    return Promise.reject(createAbortError());
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      operation.catch(() => undefined);
      reject(createAbortError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
    operation.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

function createAbortError(): Error {
  const error = new Error("Operation aborted");
  error.name = "AbortError";
  return error;
}
