import test from "node:test";
import assert from "node:assert/strict";

import { getCircuitBreaker, registerCircuitBreaker } from "@/lib/circuitBreaker";

function uniqueName(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

test("registerCircuitBreaker honors first-registered options regardless of call order", () => {
  const name = uniqueName("breaker-order");

  registerCircuitBreaker(name, { failureThreshold: 4, resetTimeoutMs: 30_000 });
  const breaker = getCircuitBreaker(name);

  breaker.recordFailure();
  breaker.recordFailure();
  breaker.recordFailure();
  assert.equal(breaker.isOpen(), false, "should remain closed before threshold");

  breaker.recordFailure();
  assert.equal(breaker.isOpen(), true, "should be open at registered threshold of 4");
});

test("getCircuitBreaker returns the same instance for repeated lookups", () => {
  const name = uniqueName("breaker-lookup");
  const a = getCircuitBreaker(name);
  const b = getCircuitBreaker(name);
  assert.strictEqual(a, b);
});

test("registerCircuitBreaker returns existing instance when called twice with same name", () => {
  const name = uniqueName("breaker-reregister");
  const a = registerCircuitBreaker(name, { failureThreshold: 3 });
  const b = registerCircuitBreaker(name, { failureThreshold: 3 });
  assert.strictEqual(a, b);
});

test("conflicting options on existing breaker do not mutate behavior", () => {
  const name = uniqueName("breaker-conflict");

  const breaker = registerCircuitBreaker(name, { failureThreshold: 2 });
  getCircuitBreaker(name, { failureThreshold: 10 });

  breaker.recordFailure();
  assert.equal(breaker.isOpen(), false);
  breaker.recordFailure();
  assert.equal(breaker.isOpen(), true, "must still trip at originally-registered threshold");
});
