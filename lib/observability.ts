type LogLevel = "info" | "warn" | "error";

type LogSink = (level: LogLevel, serialized: string) => void;

interface LogPayload {
  event: string;
  requestId?: string;
  userId?: string;
  tool?: string;
  model?: string;
  latencyMs?: number;
  error?: string;
  [key: string]: unknown;
}

type GlobalWithProcess = {
  process?: { env?: Record<string, string | undefined> } | null;
};

function getGlobalProcess(): GlobalWithProcess["process"] {
  try {
    if (typeof globalThis === "undefined") {
      return undefined;
    }
    const candidate = (globalThis as unknown as GlobalWithProcess).process;
    if (candidate && typeof candidate === "object") {
      return candidate;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function readNodeEnv(): string | undefined {
  try {
    const proc = getGlobalProcess();
    if (!proc || !proc.env || typeof proc.env !== "object") {
      return undefined;
    }
    const value = proc.env.NODE_ENV;
    return typeof value === "string" ? value : undefined;
  } catch {
    return undefined;
  }
}

function readObservabilityVerbose(): boolean {
  try {
    const proc = getGlobalProcess();
    if (!proc || !proc.env || typeof proc.env !== "object") {
      return false;
    }
    return proc.env.OBSERVABILITY_VERBOSE === "true";
  } catch {
    return false;
  }
}

function isVerboseLoggingEnabled(nodeEnv?: string): boolean {
  if (readObservabilityVerbose()) {
    return true;
  }
  const env = nodeEnv ?? readNodeEnv();
  return env === "development";
}

export function isObservabilityLoggingEnabled(nodeEnv?: string): boolean {
  return isVerboseLoggingEnabled(nodeEnv);
}

function shouldEmit(level: LogLevel, nodeEnv?: string): boolean {
  if (level === "error" || level === "warn") {
    return true;
  }
  return isVerboseLoggingEnabled(nodeEnv);
}

function safeEval(fn: () => string): string {
  try {
    return fn();
  } catch {
    return "unknown";
  }
}

function writeToStderr(message: string): void {
  try {
    if (typeof console !== "undefined" && typeof console.error === "function") {
      console.error(message);
      return;
    }
  } catch {
  }
  try {
    const proc = getGlobalProcess() as
      | (GlobalWithProcess["process"] & {
          stderr?: { write?: (s: string) => void } | null;
        })
      | undefined;
    if (proc && typeof proc === "object") {
      const stderr = (proc as { stderr?: { write?: (s: string) => void } | null }).stderr;
      if (stderr && typeof stderr.write === "function") {
        try {
          stderr.write(message + "\n");
        } catch {
        }
      }
    }
  } catch {
  }
}

function writeWithConsoleFallback(level: LogLevel, serialized: string): void {
  try {
    if (typeof console !== "undefined") {
      const method =
        level === "error"
          ? console.error
          : level === "warn"
            ? console.warn
            : console.info;
      if (typeof method === "function") {
        method.call(console, serialized);
        return;
      }
      if (typeof console.log === "function") {
        console.log(serialized);
        return;
      }
    }
  } catch {
  }
  writeToStderr(`[observability:${level}] ${serialized}`);
}

const logSink: LogSink = writeWithConsoleFallback;

function write(
  level: LogLevel,
  payload: LogPayload,
  nodeEnv?: string,
): void {
  try {
    if (!shouldEmit(level, nodeEnv)) {
      return;
    }
    const record = {
      timestamp: new Date().toISOString(),
      level,
      ...payload,
    };
    const serialized = JSON.stringify(record);
    logSink(level, serialized);
  } catch (err) {
    const reason = safeEval(() => {
      const r = err && typeof err === "object" ? String((err as Error).message ?? err) : String(err ?? "unknown");
      return `[observability] write() failed: ${r}`;
    });
    writeToStderr(reason);
  }
}

export function logInfo(payload: LogPayload, nodeEnv?: string): void {
  write("info", payload, nodeEnv);
}

export function logWarn(payload: LogPayload, nodeEnv?: string): void {
  write("warn", payload, nodeEnv);
}

export function logError(payload: LogPayload, nodeEnv?: string): void {
  write("error", payload, nodeEnv);
}

export function measureLatencyMs(
  startedAt: number,
  endedAt: number = Date.now(),
): number {
  return Math.max(0, endedAt - startedAt);
}

export function logMetric(payload: {
  metric: string;
  value: number;
  unit?: "ms" | "count" | "bytes";
  requestId?: string;
  userId?: string;
  [key: string]: unknown;
}): void {
  logInfo({
    event: "metric",
    unit: payload.unit ?? "count",
    ...payload,
  });
}

interface AttachmentLifecyclePayload {
  requestId?: string;
  userId?: string;
  fileName?: string;
  fileType?: string;
  fileSize?: number;
  attachmentId?: string;
  latencyMs?: number;
  error?: string;
}

export function logAttachmentSaveStart(
  payload: AttachmentLifecyclePayload,
): void {
  logInfo({
    event: "attachment_save_started",
    ...payload,
  });
  logMetric({
    metric: "attachment_save_started_total",
    value: 1,
    unit: "count",
    requestId: payload.requestId,
    userId: payload.userId,
  });
}

export function logAttachmentSaveSuccess(
  payload: AttachmentLifecyclePayload,
): void {
  logInfo({
    event: "attachment_save_completed",
    ...payload,
  });
  logMetric({
    metric: "attachment_save_completed_total",
    value: 1,
    unit: "count",
    requestId: payload.requestId,
    userId: payload.userId,
  });
  if (typeof payload.latencyMs === "number") {
    logMetric({
      metric: "attachment_save_latency_ms",
      value: payload.latencyMs,
      unit: "ms",
      requestId: payload.requestId,
      userId: payload.userId,
      fileType: payload.fileType,
    });
  }
}

export function logAttachmentSaveFailure(
  payload: AttachmentLifecyclePayload,
): void {
  logError({
    event: "attachment_save_failed",
    ...payload,
  });
  logMetric({
    metric: "attachment_save_failed_total",
    value: 1,
    unit: "count",
    requestId: payload.requestId,
    userId: payload.userId,
    fileType: payload.fileType,
  });
}

interface OrchestrationJobLifecyclePayload {
  jobId: string;
  jobType: string;
  userId?: string;
  requestId?: string;
  dedupeKey?: string;
  attempts?: number;
  attachmentId?: string;
  queued?: boolean;
  started?: boolean;
  atCapacity?: boolean;
  latencyMs?: number;
  error?: string;
}

export function logOrchestrationJobEnqueue(
  payload: OrchestrationJobLifecyclePayload,
): void {
  logInfo({
    event: "orchestration_job_enqueued",
    ...payload,
  });
  logMetric({
    metric: "orchestration_job_enqueued_total",
    value: 1,
    unit: "count",
    userId: payload.userId,
    jobType: payload.jobType,
    atCapacity: payload.atCapacity,
  });
}

export function logOrchestrationJobStart(
  payload: OrchestrationJobLifecyclePayload,
): void {
  logInfo({
    event: "orchestration_job_started",
    ...payload,
  });
  logMetric({
    metric: "orchestration_job_started_total",
    value: 1,
    unit: "count",
    userId: payload.userId,
    jobType: payload.jobType,
  });
}

export function logOrchestrationJobFinish(
  payload: OrchestrationJobLifecyclePayload,
): void {
  const hasError = Boolean(payload.error);
  if (hasError) {
    logError({
      event: "orchestration_job_finished",
      ...payload,
    });
  } else {
    logInfo({
      event: "orchestration_job_finished",
      ...payload,
    });
  }

  logMetric({
    metric: hasError
      ? "orchestration_job_failed_total"
      : "orchestration_job_completed_total",
    value: 1,
    unit: "count",
    userId: payload.userId,
    jobType: payload.jobType,
  });

  if (typeof payload.latencyMs === "number") {
    logMetric({
      metric: "orchestration_job_duration_ms",
      value: payload.latencyMs,
      unit: "ms",
      userId: payload.userId,
      jobType: payload.jobType,
    });
  }
}

interface DocumentProcessingLifecyclePayload {
  attachmentId: string;
  userId: string;
  conversationId?: string;
  fileType?: string;
  fileName?: string;
  chunkCount?: number;
  tokenCount?: number;
  latencyMs?: number;
  error?: string;
}

export function logDocumentProcessingStart(
  payload: DocumentProcessingLifecyclePayload,
): void {
  logInfo({
    event: "document_processing_started",
    ...payload,
  });
  logMetric({
    metric: "document_processing_started_total",
    value: 1,
    unit: "count",
    userId: payload.userId,
    fileType: payload.fileType,
  });
}

export function logDocumentProcessingFinish(
  payload: DocumentProcessingLifecyclePayload,
): void {
  const hasError = Boolean(payload.error);
  if (hasError) {
    logError({
      event: "document_processing_finished",
      ...payload,
    });
  } else {
    logInfo({
      event: "document_processing_finished",
      ...payload,
    });
  }

  logMetric({
    metric: hasError
      ? "document_processing_failed_total"
      : "document_processing_completed_total",
    value: 1,
    unit: "count",
    userId: payload.userId,
    fileType: payload.fileType,
  });

  if (typeof payload.latencyMs === "number") {
    logMetric({
      metric: "document_processing_latency_ms",
      value: payload.latencyMs,
      unit: "ms",
      userId: payload.userId,
      fileType: payload.fileType,
    });
  }
}

export function createRequestId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
