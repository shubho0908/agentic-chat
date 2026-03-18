import { isObservabilityLoggingEnabled, logError, logInfo, logWarn } from "@/lib/observability";

type LoggerMethod = (...args: unknown[]) => void;

function formatValue(value: unknown): string {
  if (value instanceof Error) {
    return value.stack || value.message;
  }

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
    return `[Function${value.name ? `: ${value.name}` : ""}]`;
  }

  if (typeof value !== "object") {
    return String(value);
  }

  const seen = new WeakSet<object>();

  try {
    const serialized = JSON.stringify(value, (_key, current) => {
      if (current instanceof Error) {
        return {
          name: current.name,
          message: current.message,
          stack: current.stack,
        };
      }

      if (typeof current === "bigint") {
        return current.toString();
      }

      if (typeof current === "symbol") {
        return current.toString();
      }

      if (typeof current === "function") {
        return `[Function${current.name ? `: ${current.name}` : ""}]`;
      }

      if (current && typeof current === "object") {
        if (seen.has(current)) {
          return "[Circular]";
        }

        seen.add(current);
      }

      return current;
    });

    return serialized ?? String(value);
  } catch {
    return Object.prototype.toString.call(value);
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

function emit(level: "info" | "warn" | "error", args: unknown[]): void {
  if (!isObservabilityLoggingEnabled()) {
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
}

export const logger = {
  info: ((...args: unknown[]) => emit("info", args)) as LoggerMethod,
  warn: ((...args: unknown[]) => emit("warn", args)) as LoggerMethod,
  error: ((...args: unknown[]) => emit("error", args)) as LoggerMethod,
  log: ((...args: unknown[]) => emit("info", args)) as LoggerMethod,
  debug: ((...args: unknown[]) => emit("info", args)) as LoggerMethod,
};

export default logger;
