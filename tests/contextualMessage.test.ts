import assert from "node:assert/strict";
import { test } from "node:test";
import { RoutingDecision, type MemoryStatus } from "../types/chat";
import { getContextualMessage } from "../components/chat/aiThinkingAnimation/utils";

const base: MemoryStatus = {
  hasMemories: false,
  hasDocuments: false,
  hasImages: false,
  memoryCount: 0,
  documentCount: 0,
  imageCount: 0,
};

test("thinking text matches routed context", () => {
  assert.equal(
    getContextualMessage(undefined, false),
    "Processing your request...",
  );
  assert.equal(
    getContextualMessage(
      {
        ...base,
        hasMemories: true,
        memoryCount: 5,
        routingDecision: RoutingDecision.MemoryOnly,
      },
      true,
    ),
    "Synthesizing response from conversation history...",
  );
  assert.equal(
    getContextualMessage(
      {
        ...base,
        hasImages: true,
        imageCount: 1,
        routingDecision: RoutingDecision.VisionOnly,
      },
      true,
    ),
    "Analyzing the image to understand the context...",
  );
  assert.equal(
    getContextualMessage(
      {
        ...base,
        hasDocuments: true,
        documentCount: 1,
        routingDecision: RoutingDecision.DocumentsOnly,
      },
      true,
    ),
    "Analyzing the document to extract relevant information...",
  );
  assert.equal(
    getContextualMessage(
      {
        ...base,
        hasDocuments: true,
        hasImages: true,
        documentCount: 3,
        imageCount: 2,
        routingDecision: RoutingDecision.Hybrid,
      },
      true,
    ),
    "Analyzing the provided context...",
  );
});
