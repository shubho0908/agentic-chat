import test from "node:test";
import assert from "node:assert/strict";

import {
  ToolFailureKind,
  classifyToolFailure,
  formatFailureMessage,
  isNegativeToolResult,
  toolCallSignature,
} from "@/lib/orchestrator/toolFailure";

test("classifies auth failures as terminal auth", () => {
  assert.equal(
    classifyToolFailure("Tool execution failed: 401 Unauthorized", "error"),
    ToolFailureKind.AUTH,
  );
  assert.equal(
    classifyToolFailure("not connected, please reconnect", "error"),
    ToolFailureKind.AUTH,
  );
  assert.equal(
    classifyToolFailure("token has expired", undefined),
    ToolFailureKind.AUTH,
  );
});

test("classifies user denials as terminal denied", () => {
  assert.equal(
    classifyToolFailure("Action denied by user.", undefined),
    ToolFailureKind.DENIED,
  );
  assert.equal(
    classifyToolFailure("Action rejected by user.", undefined),
    ToolFailureKind.DENIED,
  );
});

test("classifies timeouts and connection resets as transient", () => {
  assert.equal(
    classifyToolFailure("Tool execution failed: socket hang up", "error"),
    ToolFailureKind.TRANSIENT,
  );
  assert.equal(
    classifyToolFailure("Tool execution failed: Operation timed out", "error"),
    ToolFailureKind.TRANSIENT,
  );
  assert.equal(
    classifyToolFailure("Tool execution failed: 503 Service Unavailable", "error"),
    ToolFailureKind.TRANSIENT,
  );
});

test("classifies missing outputs as transient", () => {
  assert.equal(
    classifyToolFailure("Tool execution did not return a result.", "error"),
    ToolFailureKind.TRANSIENT,
  );
});

test("unknown errors default to retry-once unknown, never terminal", () => {
  const kind = classifyToolFailure("Tool execution failed: frobnicate", "error");
  assert.equal(kind, ToolFailureKind.UNKNOWN);
});

test("non-error results are never failures", () => {
  assert.equal(classifyToolFailure("ok", undefined), null);
  assert.equal(classifyToolFailure("", undefined), null);
});

test("hints are short static strings", () => {
  for (const kind of Object.values(ToolFailureKind)) {
    const hint = formatFailureMessage(kind, "original text");
    assert.ok(hint.includes("original text"));
    assert.ok(hint.length < 400);
  }
});

test("negative results cover errors and denials, never skips", () => {
  assert.equal(
    isNegativeToolResult({ content: "Tool execution failed: x", status: "error" }),
    true,
  );
  assert.equal(
    isNegativeToolResult({ content: "Action denied by user." }),
    true,
  );
  assert.equal(
    isNegativeToolResult({ content: "Skipped while waiting for user clarification." }),
    false,
  );
  assert.equal(isNegativeToolResult({ content: "ok" }), false);
});

test("signatures are stable across key order and safe on weird args", () => {
  assert.equal(
    toolCallSignature("t", { b: 1, a: 2 }),
    toolCallSignature("t", { a: 2, b: 1 }),
  );
  assert.notEqual(toolCallSignature("t", { a: 1 }), toolCallSignature("t", { a: 2 }));
  assert.notEqual(toolCallSignature("t", {}), toolCallSignature("u", {}));
  const circular: Record<string, unknown> = {};
  circular.self = circular;
  assert.doesNotThrow(() => toolCallSignature("t", circular));
});
