import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  MemoryGateReason,
  memoryGateDegradation,
  type MemoryGateDecision,
} from "@/lib/jev/memoryGate";
import { DegradedContextSource, type MemoryStatus } from "@/types/chat";
import { DefaultRAGContext } from "@/components/chat/aiThinkingAnimation/defaultRAGContext";

function decision(reasonCode: MemoryGateDecision["reasonCode"]): MemoryGateDecision {
  return {
    shouldQuery: false,
    probability: 0,
    reasonCode,
    modelVersion: "test",
  };
}

function status(overrides: Partial<MemoryStatus>): MemoryStatus {
  return {
    hasMemories: false,
    hasDocuments: false,
    memoryCount: 0,
    documentCount: 0,
    hasImages: false,
    imageCount: 0,
    ...overrides,
  };
}

test("memoryGateDegradation surfaces only provider failure", () => {
  const degradation = memoryGateDegradation(decision(MemoryGateReason.PROVIDER_FAILURE));
  assert.ok(degradation);
  assert.equal(degradation.source, DegradedContextSource.Memory);
  assert.ok(degradation.reason.length > 0);

  for (const reasonCode of [
    MemoryGateReason.EXPLICIT_RECALL,
    MemoryGateReason.JEV_RETRIEVE,
    MemoryGateReason.JEV_SKIP,
    MemoryGateReason.LOW_CONFIDENCE,
    MemoryGateReason.LEGACY_HEURISTIC,
    MemoryGateReason.KILL_SWITCH,
  ]) {
    assert.equal(memoryGateDegradation(decision(reasonCode)), null, reasonCode);
  }
});

test("thinking UI shows memories unavailable on gate provider failure", () => {
  const html = renderToStaticMarkup(
    createElement(DefaultRAGContext, {
      memoryStatus: status({
        degradedContexts: [
          {
            source: DegradedContextSource.Memory,
            reason: "Memory provider check failed; answering without past-chat memory",
          },
        ],
      }),
    }),
  );
  assert.match(html, /unavailable/);
  assert.doesNotMatch(html, /no relevant match/);
  assert.doesNotMatch(html, /skipped/);
});

test("thinking UI never claims memories were checked when retrieval failed", () => {
  const html = renderToStaticMarkup(
    createElement(DefaultRAGContext, {
      memoryStatus: status({
        attemptedMemory: true,
        degradedContexts: [
          { source: DegradedContextSource.Memory, reason: "All memory searches failed" },
        ],
      }),
    }),
  );
  assert.match(html, /unavailable/);
  assert.doesNotMatch(html, /Memories checked/);
});

test("thinking UI keeps the checked state when memory worked", () => {
  const html = renderToStaticMarkup(
    createElement(DefaultRAGContext, {
      memoryStatus: status({ attemptedMemory: true }),
    }),
  );
  assert.match(html, /Memories checked/);
  assert.doesNotMatch(html, /unavailable/);
});

test("thinking UI keeps the skipped state when memory is off by routing", () => {
  const html = renderToStaticMarkup(
    createElement(DefaultRAGContext, {
      memoryStatus: status({ skippedMemory: true }),
    }),
  );
  assert.match(html, /skipped/);
  assert.doesNotMatch(html, /unavailable/);
});

test("chat message memo re-renders when memory degradation or skip state arrives", async () => {
  const { areChatMessagePropsEqual } = await import("@/components/chat/chatMessage");
  const message = { id: "m1", role: "assistant", content: "" };
  const base = status({});
  const props = (memoryStatus: MemoryStatus) =>
    ({
      message,
      isLastMessage: true,
      isLoading: false,
      memoryStatus,
    }) as unknown as Parameters<typeof areChatMessagePropsEqual>[0];

  assert.equal(areChatMessagePropsEqual(props(base), props(base)), true);
  assert.equal(
    areChatMessagePropsEqual(
      props(base),
      props(
        status({
          degradedContexts: [
            { source: DegradedContextSource.Memory, reason: "provider down" },
          ],
        }),
      ),
    ),
    false,
  );
  assert.equal(
    areChatMessagePropsEqual(props(base), props(status({ skippedMemory: true }))),
    false,
  );
});
