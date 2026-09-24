import { logger } from "@/lib/logger";

export interface StreamWriter {
  enqueue(chunk: Uint8Array): boolean | void;
}

interface SafeStreamOptions {
  abortSignal?: AbortSignal;
  label: string;
  /**
   * When set, an SSE comment (`:hb`) is enqueued at this interval while the
   * stream is open. Heartbeats carry no data; they let the client distinguish
   * "backend is thinking" from "backend is gone" so stalls surface as errors
   * instead of endless processing.
   */
  heartbeatIntervalMs?: number;
}

interface FinishOptions {
  done?: Uint8Array;
  flush?: (writer: StreamWriter) => void;
}

export interface SafeStream extends StreamWriter {
  abort(): void;
  close(): boolean;
  finish(options?: FinishOptions): boolean;
  get isAborted(): boolean;
  get isFinalized(): boolean;
  get isWritable(): boolean;
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

function isClosedControllerError(error: unknown): boolean {
  return (
    error instanceof TypeError &&
    /controller is already closed|invalid state/i.test(error.message)
  );
}

export function createSafeStream(
  controller: ReadableStreamDefaultController,
  { abortSignal, label, heartbeatIntervalMs }: SafeStreamOptions,
): SafeStream {
  let aborted = abortSignal?.aborted ?? false;
  let finalized = aborted;
  let loggedUnexpectedFailure = false;

  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  const cleanupAbortListener = () => {
    abortSignal?.removeEventListener("abort", markAborted);
  };

  const stopHeartbeat = () => {
    if (heartbeatTimer !== null) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  };

  function markFinalized(): void {
    finalized = true;
    stopHeartbeat();
    cleanupAbortListener();
  }

  function markAborted(): void {
    aborted = true;
    markFinalized();
  }

  function shouldWrite(): boolean {
    if (abortSignal?.aborted) {
      markAborted();
    }

    return !aborted && !finalized;
  }

  function logUnexpectedFailure(action: string, error: unknown): void {
    if (aborted || isAbortError(error) || isClosedControllerError(error)) {
      return;
    }

    if (loggedUnexpectedFailure) {
      return;
    }

    loggedUnexpectedFailure = true;
    logger.warn(`[${label}] Failed to ${action}:`, error);
  }

  const stream: SafeStream = {
    get isAborted() {
      if (abortSignal?.aborted) {
        markAborted();
      }
      return aborted;
    },
    get isFinalized() {
      if (abortSignal?.aborted) {
        markAborted();
      }
      return finalized;
    },
    get isWritable() {
      return shouldWrite();
    },
    abort() {
      markAborted();
    },
    enqueue(chunk: Uint8Array): boolean {
      if (!shouldWrite()) {
        return false;
      }

      try {
        controller.enqueue(chunk);
        return true;
      } catch (error) {
        markFinalized();
        logUnexpectedFailure("enqueue stream chunk", error);
        return false;
      }
    },
    close(): boolean {
      if (!shouldWrite()) {
        return false;
      }

      markFinalized();
      try {
        controller.close();
        return true;
      } catch (error) {
        logUnexpectedFailure("close stream controller", error);
        return false;
      }
    },
    finish(options = {}): boolean {
      if (!shouldWrite()) {
        return false;
      }

      try {
        options.flush?.(stream);
      } catch (error) {
        markFinalized();
        logUnexpectedFailure("flush stream before close", error);
        return false;
      }

      if (options.done && !stream.enqueue(options.done)) {
        return false;
      }

      return stream.close();
    },
  };

  abortSignal?.addEventListener("abort", markAborted, { once: true });

  if (heartbeatIntervalMs !== undefined && heartbeatIntervalMs > 0) {
    const heartbeatBytes = new TextEncoder().encode(":hb\n\n");
    heartbeatTimer = setInterval(() => {
      // enqueue no-ops once the stream is no longer writable, and the
      // heartbeat stops itself on finalize/abort via markFinalized.
      stream.enqueue(heartbeatBytes);
    }, heartbeatIntervalMs);
    // A pending heartbeat must never keep a serverless invocation alive.
    (heartbeatTimer as { unref?: () => void }).unref?.();
    if (stream.isFinalized) {
      stopHeartbeat();
    }
  }

  return stream;
}
