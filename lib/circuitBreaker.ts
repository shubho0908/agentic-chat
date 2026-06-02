import { logWarn, logInfo } from "./observability";

type CircuitState = "closed" | "open" | "half_open";

interface CircuitBreaker {
  readonly name: string;
  isOpen: () => boolean;
  canAttempt: () => boolean;
  recordSuccess: () => void;
  recordFailure: () => void;
}

interface CircuitBreakerOptions {
  failureThreshold?: number;
  resetTimeoutMs?: number;
  halfOpenMaxAttempts?: number;
}

interface ResolvedCircuitBreakerOptions {
  failureThreshold: number;
  resetTimeoutMs: number;
  halfOpenMaxAttempts: number;
}

function createCircuitBreaker(
  name: string,
  options: CircuitBreakerOptions = {}
): { breaker: CircuitBreaker; resolved: ResolvedCircuitBreakerOptions } {
  const failureThreshold = options.failureThreshold ?? 5;
  const resetTimeoutMs = options.resetTimeoutMs ?? 30_000;
  const halfOpenMaxAttempts = options.halfOpenMaxAttempts ?? 2;
  const resolved: ResolvedCircuitBreakerOptions = {
    failureThreshold,
    resetTimeoutMs,
    halfOpenMaxAttempts,
  };

  let state: CircuitState = "closed";
  let failures = 0;
  let lastFailureAt = 0;
  let halfOpenAttempts = 0;

  function getCurrentState(): CircuitState {
    if (state === "open" && Date.now() - lastFailureAt >= resetTimeoutMs) {
      state = "half_open";
      halfOpenAttempts = 0;
    }
    return state;
  }

  function trip(): void {
    state = "open";
    logWarn({
      event: "circuit_breaker_opened",
      name,
      failures,
      resetAfterMs: resetTimeoutMs,
    });
  }

  const breaker: CircuitBreaker = {
    name,

    isOpen() {
      return getCurrentState() === "open";
    },

    canAttempt() {
      const s = getCurrentState();
      return s === "closed" || s === "half_open";
    },

    recordSuccess() {
      if (state === "half_open" || state === "open") {
        logInfo({ event: "circuit_breaker_closed", name });
      }
      failures = 0;
      state = "closed";
      halfOpenAttempts = 0;
    },

    recordFailure() {
      failures++;
      lastFailureAt = Date.now();

      if (state === "half_open") {
        halfOpenAttempts++;
        if (halfOpenAttempts >= halfOpenMaxAttempts) trip();
        return;
      }

      if (failures >= failureThreshold) trip();
    },
  };

  return { breaker, resolved };
}

interface RegisteredBreaker {
  breaker: CircuitBreaker;
  resolved: ResolvedCircuitBreakerOptions;
}

const breakers = new Map<string, RegisteredBreaker>();

function optionsConflict(
  resolved: ResolvedCircuitBreakerOptions,
  requested: CircuitBreakerOptions
): boolean {
  if (
    requested.failureThreshold !== undefined &&
    requested.failureThreshold !== resolved.failureThreshold
  ) {
    return true;
  }
  if (
    requested.resetTimeoutMs !== undefined &&
    requested.resetTimeoutMs !== resolved.resetTimeoutMs
  ) {
    return true;
  }
  if (
    requested.halfOpenMaxAttempts !== undefined &&
    requested.halfOpenMaxAttempts !== resolved.halfOpenMaxAttempts
  ) {
    return true;
  }
  return false;
}

export function registerCircuitBreaker(
  name: string,
  options: CircuitBreakerOptions = {}
): CircuitBreaker {
  const existing = breakers.get(name);
  if (existing) {
    if (optionsConflict(existing.resolved, options)) {
      logWarn({
        event: "circuit_breaker_options_conflict",
        name,
        existing: existing.resolved,
        requested: options,
        message:
          "Conflicting circuit breaker options ignored. Define each breaker's options in exactly one place.",
      });
    }
    return existing.breaker;
  }

  const created = createCircuitBreaker(name, options);
  breakers.set(name, created);
  return created.breaker;
}

export function getCircuitBreaker(
  name: string,
  options?: CircuitBreakerOptions
): CircuitBreaker {
  return registerCircuitBreaker(name, options ?? {});
}
