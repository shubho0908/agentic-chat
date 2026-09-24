import test from "node:test";
import assert from "node:assert/strict";

import {
  JEV_TOOL_ROUTER_QUESTIONS,
  JEV_TOOL_DIAGNOSIS_QUESTIONS,
  mapJevDiagnosisResult,
  mapJevToolRouterResult,
  previewToolArgs,
} from "@/lib/jev/toolRouter";
import type { JevEvaluateResult } from "@/lib/jev/client";

function fakeResult(answers: Record<string, unknown>): JevEvaluateResult {
  return {
    answers: answers as JevEvaluateResult["answers"],
    modelVersion: "jev-1.13.0",
    latencyMs: 42,
  };
}

test("router questions cover route choice plus work and loop signals", () => {
  assert.equal(JEV_TOOL_ROUTER_QUESTIONS.route.type, "choice");
  assert.equal(JEV_TOOL_ROUTER_QUESTIONS.needs_more_tool_work.type, "noul");
  assert.equal(JEV_TOOL_ROUTER_QUESTIONS.at_risk_of_loop.type, "noul");
});

test("diagnosis questions stay structured, never free text", () => {
  assert.equal(JEV_TOOL_DIAGNOSIS_QUESTIONS.retry_worthwhile.type, "noul");
  assert.equal(JEV_TOOL_DIAGNOSIS_QUESTIONS.fix_direction.type, "choice");
});

test("mapJevToolRouterResult maps a valid response", () => {
  const decision = mapJevToolRouterResult(
    fakeResult({
      route: {
        type: "choice",
        choice: "tools",
        confidence: 0.8,
        probabilities: { tools: 0.8, end: 0.2 },
      },
      needs_more_tool_work: { type: "noul", noul: 0.7 },
      at_risk_of_loop: { type: "noul", noul: 0.1 },
    }),
  );
  assert.ok(decision);
  assert.equal(decision.route, "tools");
  assert.equal(decision.routeConfidence, 0.8);
  assert.equal(decision.needsMoreWork, 0.7);
  assert.equal(decision.loopRisk, 0.1);
});

test("mapJevToolRouterResult rejects out-of-set routes and wrong types", () => {
  assert.equal(
    mapJevToolRouterResult(
      fakeResult({
        route: { type: "choice", choice: "explode" },
        needs_more_tool_work: { type: "noul", noul: 0.5 },
        at_risk_of_loop: { type: "noul", noul: 0.5 },
      }),
    ),
    null,
  );
  assert.equal(
    mapJevToolRouterResult(
      fakeResult({
        route: { type: "noul", noul: 0.5 },
        needs_more_tool_work: { type: "noul", noul: 0.5 },
        at_risk_of_loop: { type: "noul", noul: 0.5 },
      }),
    ),
    null,
  );
  assert.equal(
    mapJevToolRouterResult(
      fakeResult({ route: { type: "choice", choice: "end" } }),
    ),
    null,
  );
});

test("mapJevDiagnosisResult maps valid advice and rejects the rest", () => {
  const advice = mapJevDiagnosisResult(
    fakeResult({
      retry_worthwhile: { type: "noul", noul: 0.2 },
      fix_direction: { type: "choice", choice: "abandon" },
    }),
  );
  assert.ok(advice);
  assert.equal(advice.retryWorthwhile, 0.2);
  assert.equal(advice.fixDirection, "abandon");

  assert.equal(
    mapJevDiagnosisResult(
      fakeResult({
        retry_worthwhile: { type: "noul", noul: 0.2 },
        fix_direction: { type: "choice", choice: "delete_everything" },
      }),
    ),
    null,
  );
  assert.equal(mapJevDiagnosisResult(fakeResult({})), null);
});

test("previewToolArgs keeps shape but never leaks user content", () => {
  const preview = previewToolArgs({
    to: "secret.person@example.com",
    subject: "Confidential: layoffs plan",
    body: "x".repeat(500),
    count: 3,
    draft: true,
    nested: { html: "<p>do not leak</p>", items: [1, 2, 3] },
  });

  assert.ok(preview.length <= 200);
  assert.ok(preview.includes('"to":"string(25)"'));
  assert.ok(preview.includes('"body":"string(500)"'));
  assert.ok(preview.includes('"count":"number"'));
  assert.ok(preview.includes('"items":"array(3)"'));
  for (const leaked of [
    "secret.person",
    "layoffs",
    "xxxx",
    "do not leak",
  ]) {
    assert.ok(!preview.includes(leaked), `must not contain: ${leaked}`);
  }
});

test("previewToolArgs collapses deep objects so circular input cannot recurse", () => {
  const circular: Record<string, unknown> = {};
  circular.self = circular;
  assert.equal(previewToolArgs(circular), '{"self":{"self":"object"}}');
});
