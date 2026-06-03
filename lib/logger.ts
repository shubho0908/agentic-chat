import { isObservabilityLoggingEnabled, logError, logInfo, logWarn } from "@/lib/observability";

type LoggerMethod = (...args: unknown[]) => void;

function safeStringify(value: unknown): string {
  try {
    const seen = new WeakSet<object>();
    const serialized = JSON.stringify(value, (_key, current) => {
      try {
        if (typeof current === "bigint") {
          return current.toString();
        }
        if (typeof current === "symbol") {
          return current.toString();
        }
        if (typeof current === "function") {
          return `[Function${typeof current.name === "string" ? `: ${current.name}` : ""}]`;
        }
        if (current && typeof current === "object") {
          if (seen.has(current)) {
            return "[Circular]";
          }
          seen.add(current);
          if (
            typeof (current as Record<string, unknown>).stack === "string" ||
            typeof (current as Record<string, unknown>).message === "string"
          ) {
            try {
              const err = current as Record<string, unknown>;
              return {
                name: typeof err.name === "string" ? err.name : "",
                message: typeof err.message === "string" ? err.message : String(err.message ?? ""),
                stack: typeof err.stack === "string" ? err.stack : undefined,
              };
            } catch {
              return "[Error-like]";
            }
          }
        }
        return current;
      } catch {
        return "[Unserializable]";
      }
    });
    return serialized ?? String(value);
  } catch {
    return Object.prototype.toString.call(value);
  }
}

function safeEval(fn: () => string): string {
  try {
    return fn();
  } catch {
    return "unknown";
  }
}

function formatValue(value: unknown): string {
  try {
    if (typeof value === "string") {
      return value;
    }

    if (
      value === null ||
      value === undefined ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      typeof value === "bigint" ||
      typeof value === "symbol"
    ) {
      return String(value);
    }

    if (typeof value === "function") {
      return `[Function${typeof value.name === "string" ? `: ${value.name}` : ""}]`;
    }

    if (typeof value !== "object") {
      return String(value);
    }

    try {
      const errCandidate = value as Record<string, unknown>;
      if (typeof errCandidate.stack === "string" || typeof errCandidate.message === "string") {
        const stack = typeof errCandidate.stack === "string" ? errCandidate.stack : undefined;
        const message = typeof errCandidate.message === "string" ? errCandidate.message : String(errCandidate.message ?? "");
        return stack || message;
      }
    } catch {
    }

    return safeStringify(value);
  } catch {
    return "[Log Error: Unformatable value]";
  }
}

function formatArgs(args: unknown[]): { message: string; details?: string[] } {
  const formatted = args.map((value) => formatValue(value));

  if (formatted.length === 0) {
    return { message: "" };
  }

  return formatted.length > 1
    ? { message: formatted.join(" "), details: formatted.slice(1) }
    : { message: formatted[0] };
}

export function emergencyLog(messageOrFactory: string | (() => string)): void {
  const message = safeEval(() => typeof messageOrFactory === "function" ? messageOrFactory() : messageOrFactory);
  try {
    if (typeof console !== "undefined" && typeof console.error === "function") {
      console.error("[logger:emergency] " + message);
      return;
    }
  } catch {
  }
  const g = (typeof globalThis !== "undefined" ? globalThis : null) as { process?: unknown } | null;
  if (g && typeof g.process === "object" && g.process !== null) {
    const stderr = (g.process as { stderr?: { write?: (s: string) => void } }).stderr;
    if (stderr && typeof stderr.write === "function") {
      try {
        stderr.write("[logger:emergency] " + message + "\n");
      } catch {
      }
    }
  }
}

function emit(level: "info" | "warn" | "error", args: unknown[]): void {
  try {
    if (level === "info" && !isObservabilityLoggingEnabled()) {
      return;
    }
    const { message, details } = formatArgs(args);
    const payload = details && details.length > 0 ? { event: `console_${level}`, message, details } : { event: `console_${level}`, message };
    if (level === "error") {
      logError(payload);
      return;
    }
    if (level === "warn") {
      logWarn(payload);
      return;
    }
    logInfo(payload);
  } catch (err) {
    emergencyLog(() => {
      const r = err && typeof err === "object" ? String((err as Error).message ?? err) : String(err ?? "unknown");
      return `emit(${level}) failed: ${r}`;
    });
  }
}

export const logger = {
  info: ((...args: unknown[]) => emit("info", args)) as LoggerMethod,
  warn: ((...args: unknown[]) => emit("warn", args)) as LoggerMethod,
  error: ((...args: unknown[]) => emit("error", args)) as LoggerMethod,
  log: ((...args: unknown[]) => emit("info", args)) as LoggerMethod,
  debug: ((...args: unknown[]) => emit("info", args)) as LoggerMethod,
};
