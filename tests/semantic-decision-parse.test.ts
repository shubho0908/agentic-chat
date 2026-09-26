import assert from "node:assert/strict";
import test from "node:test";
import { decideConversationResources } from "@/lib/chat/semanticResourceSelection";

const input = { phase: "intent" as const, query: "PDF mein bande ka email ID aur phone number hai kya?", resources: [], recentTurns: [] };

test("invalid or empty JSON decision retries once and accepts the next valid response", async () => {
  const original = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = (async () => {
    requests++;
    const content = requests === 1 ? "" : '{"state":"selected"}';
    return new Response(JSON.stringify({ id: "test", object: "chat.completion", model: "gpt-6-luna", choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  try {
    assert.deepEqual(await decideConversationResources("test-key", "gpt-6-luna", input), { state: "selected", ids: [] });
    assert.equal(requests, 2);
  } finally { globalThis.fetch = original; }
});

test("persistent invalid model decisions fail closed after bounded attempts", async () => {
  const original = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = (async () => {
    requests++;
    return new Response(JSON.stringify({ id: "test", object: "chat.completion", model: "gpt-6-luna", choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: "" } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  try {
    await assert.rejects(decideConversationResources("test-key", "gpt-6-luna", input), /Invalid resource decision/);
    assert.equal(requests, 2);
  } finally { globalThis.fetch = original; }
});

test("malformed selected IDs are retried instead of accepted as an unusable decision", async () => {
  const original = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = (async () => {
    requests++;
    const content = requests === 1 ? '{"state":"selected","ids":[42]}' : '{"state":"selected","ids":["pdf-1"]}';
    return new Response(JSON.stringify({ id: "test", object: "chat.completion", model: "gpt-6-luna", choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  try {
    assert.deepEqual(await decideConversationResources("test-key", "gpt-6-luna", { ...input, phase: "selection" }), { state: "selected", ids: ["pdf-1"] });
    assert.equal(requests, 2);
  } finally { globalThis.fetch = original; }
});
