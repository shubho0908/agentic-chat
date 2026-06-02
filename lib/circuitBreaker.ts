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

function createCircuitBreaker(
  name: string,
  options: CircuitBreakerOptions = {}
): CircuitBreaker {
  const failureThreshold = options.failureThreshold ?? 5;
  const resetTimeoutMs = options.resetTimeoutMs ?? 30_000;
  const halfOpenMaxAttempts = options.halfOpenMaxAttempts ?? 2;

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

  return {
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
}

const breakers = new Map<string, CircuitBreaker>();

export function getCircuitBreaker(
  name: string,
  options?: CircuitBreakerOptions
): CircuitBreaker {
  let breaker = breakers.get(name);
  if (!breaker) {
    breaker = createCircuitBreaker(name, options);
    breakers.set(name, breaker);
  }
  return breaker;
}
