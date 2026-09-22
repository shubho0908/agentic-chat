import test from "node:test";
import assert from "node:assert/strict";

import { abortAware } from "@/lib/orchestrator/abortAware";

test("passes through the operation's value when the signal stays quiet", async () => {
  const controller = new AbortController();
  const result = await abortAware(Promise.resolve("db-result"), controller.signal);
  assert.equal(result, "db-result");
});

test("propagates the operation's own failure unchanged", async () => {
  const controller = new AbortController();
  await assert.rejects(
    abortAware(Promise.reject(new Error("database down")), controller.signal),
    /database down/,
  );
});

test("a stalled operation rejects with AbortError when the signal fires", async () => {
  const controller = new AbortController();
  const never = new Promise<string>(() => {});
  const pending = abortAware(never, controller.signal);
  setTimeout(() => controller.abort(), 20);
  await assert.rejects(pending, (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.equal(error.name, "AbortError");
    return true;
  });
});

test("rejects immediately on an already-aborted signal", async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    abortAware(new Promise<string>(() => {}), controller.signal),
    (error: unknown) => error instanceof Error && error.name === "AbortError",
  );
});

test("a late rejection after abort is swallowed, not unhandled", async () => {
  const controller = new AbortController();
  let rejectLate: (e: Error) => void = () => {};
  const late = new Promise<string>((_, reject) => {
    rejectLate = reject;
  });
  const pending = abortAware(late, controller.signal);
  controller.abort();
  await assert.rejects(pending, (error: unknown) => error instanceof Error && error.name === "AbortError");
  rejectLate(new Error("db finally failed"));
  await new Promise((resolve) => setTimeout(resolve, 10));
});
