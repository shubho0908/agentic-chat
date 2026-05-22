const LOG_LEVEL = {
  DEBUG: "debug",
  ERROR: "error",
  INFO: "info",
  LOG: "log",
  WARN: "warn",
};

function formatArg(value) {
  if (value instanceof Error) {
    return value.stack || value.message;
  }

  if (
    value === null ||
    value === undefined ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint" ||
    typeof value === "symbol"
  ) {
    return String(value);
  }

  try {
    return JSON.stringify(value);
  } catch {
    return Object.prototype.toString.call(value);
  }
}

function write(level, args) {
  const line = args.map(formatArg).join(" ");
  const stream = level === LOG_LEVEL.ERROR || level === LOG_LEVEL.WARN ? process.stderr : process.stdout;
  stream.write(`${line}\n`);
}

const logger = {
  info: (...args) => write(LOG_LEVEL.INFO, args),
  warn: (...args) => write(LOG_LEVEL.WARN, args),
  error: (...args) => write(LOG_LEVEL.ERROR, args),
  log: (...args) => write(LOG_LEVEL.INFO, args),
  debug: (...args) => write(LOG_LEVEL.INFO, args),
};

export default logger;
