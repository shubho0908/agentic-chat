import test from "node:test";
import assert from "node:assert/strict";

import { gatePassages } from "@/lib/jev/passageGate";
import { gateMemoryEvidence } from "@/lib/jev/memoryEvidenceGate";
import { mediateMemoryIntent } from "@/lib/jev/memoryGate";
import { isRerankAvailable } from "@/lib/rag/retrieval/reranker";
import { toRankedCandidates } from "@/lib/rag/retrieval/search";
import type { RetrievalCandidate } from "@/lib/rag/retrieval/hybrid";
import type { RerankResult } from "@/types/rag";
import { withEnv } from "@/tests/helpers";

const candidate = (id: string): RetrievalCandidate => ({
  content: `content-${id}`,
  score: 1,
  metadata: { chunkId: id, attachmentId: "a", fileName: "a.pdf" },
});

test("rerank availability covers Jev-only setups and nothing else", () => {
  const cases: Array<[Record<string, string | undefined>, boolean]> = [
    [
      {
        COHERE_API_KEY: "c",
        JEV_RERANK_MODE: undefined,
        TYPESAFE_API_KEY: undefined,
      },
      true,
    ],
    [
      {
        COHERE_API_KEY: undefined,
        JEV_RERANK_MODE: "active",
        TYPESAFE_API_KEY: "t",
      },
      true,
    ],
    [
      {
        COHERE_API_KEY: undefined,
        JEV_RERANK_MODE: "ab",
        TYPESAFE_API_KEY: "t",
      },
      true,
    ],
    [
      {
        COHERE_API_KEY: undefined,
        JEV_RERANK_MODE: "active",
        TYPESAFE_API_KEY: undefined,
      },
      false,
    ],
    [
      {
        COHERE_API_KEY: undefined,
        JEV_RERANK_MODE: "shadow",
        TYPESAFE_API_KEY: "t",
      },
      false,
    ],
    [
      {
        COHERE_API_KEY: undefined,
        JEV_RERANK_MODE: "off",
        TYPESAFE_API_KEY: "t",
      },
      false,
    ],
    [
      {
        COHERE_API_KEY: undefined,
        JEV_RERANK_MODE: "garbage",
        TYPESAFE_API_KEY: "t",
      },
      false,
    ],
    [
      {
        COHERE_API_KEY: undefined,
        JEV_RERANK_MODE: undefined,
        TYPESAFE_API_KEY: undefined,
      },
      false,
    ],
  ];
  for (const [env, expected] of cases)
    assert.equal(
      withEnv(env, isRerankAvailable),
      expected,
      JSON.stringify(env),
    );
});

test("ranked candidates keep reranker order even when raw scores disagree", () => {
  const meta = (id: string) => ({
    attachmentId: "a",
    fileName: "a.pdf",
    chunkId: id,
  });
  const reranked: RerankResult[] = [
    { content: "r1", score: 0.3, scoreOrigin: "rerank", metadata: meta("r1") },
    { content: "r2", score: 0.1, scoreOrigin: "rerank", metadata: meta("r2") },
    { content: "filler", score: 0.9, metadata: meta("filler") },
  ];
  const ranked = toRankedCandidates(reranked);
  assert.deepEqual(
    ranked.map((c) => c.content),
    ["r1", "r2", "filler"],
  );
  assert.ok(ranked[0].rankScore! > ranked[1].rankScore!);
  assert.ok(ranked[1].rankScore! > ranked[2].rankScore!);
  assert.deepEqual(
    ranked.map((c) => c.score),
    [0.3, 0.1, 0.9],
  );
});

test("passage gate applies the failure posture when the provider key is missing", async () => {
  const candidates = [candidate("a"), candidate("b")];
  const run = (env: Record<string, string | undefined>) =>
    withEnv({ TYPESAFE_API_KEY: undefined, ...env }, () =>
      gatePassages("q", candidates),
    );
  assert.deepEqual(
    await run({
      JEV_PASSAGE_GATE_MODE: "active",
      JEV_PASSAGE_GATE_ON_FAILURE: "closed",
    }),
    [],
  );
  assert.deepEqual(
    await run({
      JEV_PASSAGE_GATE_MODE: "active",
      JEV_PASSAGE_GATE_ON_FAILURE: undefined,
    }),
    candidates,
  );
  assert.deepEqual(
    await run({
      JEV_PASSAGE_GATE_MODE: "shadow",
      JEV_PASSAGE_GATE_ON_FAILURE: "closed",
    }),
    candidates,
  );
  assert.deepEqual(
    await run({
      JEV_PASSAGE_GATE_MODE: "off",
      JEV_PASSAGE_GATE_ON_FAILURE: "closed",
    }),
    candidates,
  );
  assert.deepEqual(
    await withEnv(
      {
        TYPESAFE_API_KEY: undefined,
        JEV_PASSAGE_GATE_MODE: "active",
        JEV_PASSAGE_GATE_ON_FAILURE: "closed",
      },
      () => gatePassages("q", []),
    ),
    [],
  );
});

test("memory evidence keeps unscored memories and still drops low numeric scores", async () => {
  const records = [
    { memory: "unscored fact" },
    { memory: "low score fact", score: 0.05 },
    { memory: "floor fact", score: 0.15 },
  ];
  const kept = await withEnv(
    { JEV_MEMORY_EVIDENCE_MODE: "off", TYPESAFE_API_KEY: undefined },
    () => gateMemoryEvidence("what is my name", records),
  );
  assert.deepEqual(
    kept.map((r) => r.memory),
    ["unscored fact", "floor fact"],
  );
  const lone = await withEnv(
    { JEV_MEMORY_EVIDENCE_MODE: "off", TYPESAFE_API_KEY: undefined },
    () => gateMemoryEvidence("what is my name", [{ memory: "unscored fact" }]),
  );
  assert.deepEqual(
    lone.map((r) => r.memory),
    ["unscored fact"],
  );
});

test("memory gate cache key covers every character Jev evaluates", () =>
  withEnv(
    {
      MEMORY_ENABLED: "true",
      JEV_MEMORY_GATE_MODE: "active",
      TYPESAFE_API_KEY: "test",
    },
    async () => {
      const original = globalThis.fetch;
      const seen: string[] = [];
      globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as {
          state: { recent_conversation: string };
        };
        seen.push(body.state.recent_conversation);
        const noul = seen.length === 1 ? 0.05 : 0.95;
        return new Response(
          JSON.stringify({
            model: "jev-test",
            answers: { useful: { type: "noul", noul } },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }) as typeof fetch;
      try {
        const tail = "t".repeat(700);
        const messageText = `plan my week ${Date.now()}`;
        const first = await mediateMemoryIntent({
          messageText,
          userId: "u-key",
          recentConversation: `alpha context ${tail}`,
        });
        const second = await mediateMemoryIntent({
          messageText,
          userId: "u-key",
          recentConversation: `beta context ${tail}`,
        });
        assert.equal(
          seen.length,
          2,
          "different evaluated context must not share a decision",
        );
        assert.equal(first.shouldQuery, false);
        assert.equal(second.shouldQuery, true);
        await mediateMemoryIntent({
          messageText,
          userId: "u-key",
          recentConversation: `beta context ${tail}`,
        });
        assert.equal(
          seen.length,
          2,
          "identical evaluated input still reuses the cached decision",
        );
        const far = "x".repeat(2_000);
        await mediateMemoryIntent({
          messageText,
          userId: "u-key",
          recentConversation: `gamma ${far}${tail}`,
        });
        await mediateMemoryIntent({
          messageText,
          userId: "u-key",
          recentConversation: `delta ${far}${tail}`,
        });
        assert.equal(
          seen.length,
          3,
          "context Jev never sees must not split the cache",
        );
      } finally {
        globalThis.fetch = original;
      }
    },
  ));

test("e2e: Jev-only active rerank drives final order; provider failure keeps the pre-rerank order", async () => {
  const { rerankDocuments } = await import("@/lib/rag/retrieval/reranker");
  const { diversifyCandidates } = await import("@/lib/rag/retrieval/hybrid");
  const pre: RetrievalCandidate[] = ["a", "b", "c", "d"].map((id, i) => ({
    content: `passage ${id}`,
    score: 0.9 - i * 0.1,
    rankScore: 0.05 - i * 0.01,
    metadata: { chunkId: id, attachmentId: "att", fileName: "f.pdf" },
  }));
  const jevScore: Record<string, number> = {
    "passage a": 0.1,
    "passage b": 0.2,
    "passage c": 0.95,
    "passage d": 0.6,
  };
  const original = globalThis.fetch;
  const env = {
    COHERE_API_KEY: undefined,
    JEV_RERANK_MODE: "active",
    TYPESAFE_API_KEY: "test",
  };
  const finalOrder = async () => {
    assert.equal(withEnv(env, isRerankAvailable), true);
    const reranked = await withEnv(env, () =>
      rerankDocuments("q", pre, { topN: 4, conversationId: "c1" }),
    );
    return diversifyCandidates(toRankedCandidates(reranked), {
      limit: 3,
      maxPerAttachment: 10,
    }).map((c) => c.metadata.chunkId);
  };
  try {
    globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        state: { passage?: string; document?: string; candidate?: string };
      };
      const text = JSON.stringify(body.state);
      const hit = Object.keys(jevScore).find((k) => text.includes(k))!;
      return new Response(
        JSON.stringify({
          model: "jev-test",
          answers: { answers_query: { type: "noul", noul: jevScore[hit] } },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;
    assert.deepEqual(await finalOrder(), ["c", "d", "b"]);
    globalThis.fetch = (async () =>
      new Response("not json", { status: 200 })) as typeof fetch;
    assert.deepEqual(await finalOrder(), ["a", "b", "c"]);
  } finally {
    globalThis.fetch = original;
  }
});

test("stress: 400 concurrent memory gate calls over 40 contexts with a shared 700-char tail", () =>
  withEnv(
    {
      MEMORY_ENABLED: "true",
      JEV_MEMORY_GATE_MODE: "active",
      TYPESAFE_API_KEY: "test",
    },
    async () => {
      const original = globalThis.fetch;
      let calls = 0;
      globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
        calls++;
        const body = JSON.parse(String(init?.body)) as {
          state: { recent_conversation: string };
        };
        const index = Number(
          /ctx-(\d+)/.exec(body.state.recent_conversation)![1],
        );
        await new Promise((resolve) => setTimeout(resolve, 5));
        return new Response(
          JSON.stringify({
            model: "jev-test",
            answers: {
              useful: { type: "noul", noul: index % 2 ? 0.95 : 0.05 },
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }) as typeof fetch;
      try {
        const tail = "shared tail ".repeat(60);
        const messageText = `stress request ${Date.now()}`;
        const results = await Promise.all(
          Array.from({ length: 400 }, (_, i) => {
            const index = i % 40;
            return mediateMemoryIntent({
              messageText,
              userId: "stress-user",
              recentConversation: `ctx-${index} ${tail}`,
            }).then((d) => ({ index, d }));
          }),
        );
        assert.equal(calls, 40);
        for (const { index, d } of results)
          assert.equal(d.shouldQuery, index % 2 === 1, `ctx-${index}`);
      } finally {
        globalThis.fetch = original;
      }
    },
  ));
