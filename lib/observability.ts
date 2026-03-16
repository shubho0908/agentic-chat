type LogLevel = 'info' | 'warn' | 'error';

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

function write(level: LogLevel, payload: LogPayload): void {
  const record = {
    timestamp: new Date().toISOString(),
    level,
    ...payload,
  };

  const serialized = JSON.stringify(record);

  if (level === 'error') {
    console.error(serialized);
    return;
  }

  if (level === 'warn') {
    console.warn(serialized);
    return;
  }

  console.info(serialized);
}

export function logInfo(payload: LogPayload): void {
  write('info', payload);
}

export function logWarn(payload: LogPayload): void {
  write('warn', payload);
}

export function logError(payload: LogPayload): void {
  write('error', payload);
}

export function createRequestId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
