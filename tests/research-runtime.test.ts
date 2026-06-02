import test from "node:test";
import assert from "node:assert/strict";
import { HumanMessage } from "@langchain/core/messages";
import { z } from "zod";

import { ResearchNode } from "@/lib/orchestrator/sub-agents/research/constants";
import { getRankedSources } from "@/lib/orchestrator/sub-agents/research/scoring";
import type {
  ResearchSource,
  ResearchStateType,
} from "@/lib/orchestrator/sub-agents/research/state";
import {
  dedupeSearchQueries,
  invokeResearchJson,
  invokeResearchLLM,
  type InvokableLLM,
} from "@/lib/orchestrator/sub-agents/research/runtime";

function createResearchState(overrides: Partial<ResearchStateType> = {}): ResearchStateType {
  return {
    query: "test",
    userContext: "",
    subQuestions: [],
    searchQueries: [],
    searchedQueries: [],
    sources: [],
    claims: [],
    synthesis: "",
    searchRound: 0,
    maxRounds: 6,
    gaps: [],
    reflexionPassed: false,
    correctionAttempts: 0,
    tokenUsage: {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      llmCalls: 0,
    },
    tokenBudget: 60_000,
    clarificationQuestions: [],
    ...overrides,
  };
}

test("dedupeSearchQueries removes duplicates and previously searched queries", () => {
  const queries = dedupeSearchQueries(
    ["React performance", "react   performance", "Next.js caching", " React performance "],
    ["next.js caching"]
  );

  assert.deepEqual(queries, ["React performance"]);
});

test("invokeResearchJson retries with a JSON repair prompt before using fallback", async () => {
  let calls = 0;
  const fakeLLM: InvokableLLM = {
    async invoke() {
      calls += 1;
      return {
        content: calls === 1 ? "not json" : '{"ok":true}',
        usage_metadata: {
          input_tokens: 2,
          output_tokens: 3,
          total_tokens: 5,
        },
      };
    },
  };

  const result = await invokeResearchJson(
    fakeLLM,
    [new HumanMessage("return json")],
    {
      nodeName: ResearchNode.TRIAGE,
      state: createResearchState(),
      maxOutputTokens: 20,
      timeoutMs: 1000,
      schema: z.object({ ok: z.boolean() }),
      fallback: { ok: false },
      schemaDescription: '{"ok": boolean}',
    }
  );

  assert.equal(calls, 2);
  assert.deepEqual(result.value, { ok: true });
  assert.equal(result.tokenUsage.llmCalls, 2);
  assert.equal(result.tokenUsage.totalTokens, 10);
});

test("invokeResearchJson repair call enforces budget against merged token usage", async () => {
  let calls = 0;
  const fakeLLM: InvokableLLM = {
    async invoke() {
      calls += 1;
      return {
        content: "not json",
        usage_metadata: {
          input_tokens: 30,
          output_tokens: 20,
          total_tokens: 50,
        },
      };
    },
  };

  const result = await invokeResearchJson(
    fakeLLM,
    [new HumanMessage("hi")],
    {
      nodeName: ResearchNode.TRIAGE,
      state: createResearchState({ tokenBudget: 80 }),
      maxOutputTokens: 30,
      timeoutMs: 1000,
      schema: z.object({ ok: z.boolean() }),
      fallback: { ok: false },
      schemaDescription: '{"ok": boolean}',
    }
  );

  assert.equal(calls, 1);
  assert.deepEqual(result.value, { ok: false });
});

test("invokeResearchLLM rejects before invoking when token budget would be exceeded", async () => {
  let invoked = false;
  const fakeLLM: InvokableLLM = {
    async invoke() {
      invoked = true;
      return { content: "unused" };
    },
  };

  await assert.rejects(
    () =>
      invokeResearchLLM(fakeLLM, [new HumanMessage("large prompt")], {
        nodeName: ResearchNode.SYNTHESIZE,
        state: createResearchState({ tokenBudget: 2 }),
        maxOutputTokens: 20,
        timeoutMs: 1000,
      }),
    /token budget exceeded/i
  );
  assert.equal(invoked, false);
});

test("invokeResearchLLM propagates abort signals and honors pre-aborted requests", async () => {
  const controller = new AbortController();
  let receivedSignal: AbortSignal | undefined;
  let calls = 0;
  const fakeLLM: InvokableLLM = {
    async invoke(_messages, config) {
      calls += 1;
      receivedSignal = config?.signal;
      return { content: "ok" };
    },
  };

  await invokeResearchLLM(fakeLLM, [new HumanMessage("prompt")], {
    nodeName: ResearchNode.SYNTHESIZE,
    state: createResearchState(),
    config: { signal: controller.signal },
    maxOutputTokens: 20,
    timeoutMs: 1000,
  });

  assert.equal(calls, 1);
  assert.ok(receivedSignal instanceof AbortSignal);

  controller.abort(new Error("cancelled by test"));
  await assert.rejects(
    () =>
      invokeResearchLLM(fakeLLM, [new HumanMessage("prompt")], {
        nodeName: ResearchNode.SYNTHESIZE,
        state: createResearchState(),
        config: { signal: controller.signal },
        maxOutputTokens: 20,
        timeoutMs: 1000,
      }),
    (error) => error instanceof Error && error.name === "AbortError"
  );
  assert.equal(calls, 1);
});

test("getRankedSources enforces max 3 sources per domain", () => {
  const sources: ResearchSource[] = [
    ...Array.from({ length: 5 }, (_, index) => ({
      title: `Example ${index}`,
      url: `https://example.com/${index}`,
      snippet: "content",
      qualityScore: 100 - index,
      domain: "example.com",
      queryOrigin: "q",
    })),
    {
      title: "Other",
      url: "https://other.com/a",
      snippet: "content",
      qualityScore: 50,
      domain: "other.com",
      queryOrigin: "q",
    },
  ];

  const ranked = getRankedSources(sources, 10);
  assert.equal(ranked.filter((source) => source.domain === "example.com").length, 3);
  assert.equal(ranked.some((source) => source.domain === "other.com"), true);
});
