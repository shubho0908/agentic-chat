import test from "node:test";
import assert from "node:assert/strict";
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import {
  MemorySaver,
  StateGraph,
  type BaseCheckpointSaver,
} from "@langchain/langgraph";
import { AgentState } from "../../lib/orchestrator/state";
import { buildBoundedModelContext } from "../../lib/orchestrator/modelContext";
import { deriveThreadId } from "../../lib/orchestrator/threadIdentity";
import { messageFingerprint } from "../../lib/orchestrator/messageIdentity";
import { convertToLangChainMessages } from "../../lib/orchestrator/messageConversion";

function compile(checkpointer: BaseCheckpointSaver = new MemorySaver()) {
  return new StateGraph(AgentState)
    .addNode("respond", async (state) => ({
      messages: [
        new AIMessage({ id: `a-${state.messages.at(-1)?.id}`, content: "ok" }),
      ],
    }))
    .addEdge("__start__", "respond")
    .addEdge("respond", "__end__")
    .compile({ checkpointer });
}
async function submitIncrementally(
  graph: ReturnType<typeof compile>,
  threadId: string,
  incoming: BaseMessage[],
) {
  const config = { configurable: { thread_id: threadId } };
  const before = await graph.getState(config);
  const ids = new Set(
    (before.values?.messages ?? []).flatMap((m: BaseMessage) =>
      m.id ? [m.id] : [],
    ),
  );
  const delta = before.values?.messages?.length
    ? incoming.filter((m) => !m.id || !ids.has(m.id))
    : incoming;
  if (delta.length) await graph.invoke({ messages: delta }, config);
  return (await graph.getState(config)).values.messages as BaseMessage[];
}

test("stable API message conversion makes full-window retries idempotent", async () => {
  const graph = compile();
  const thread = deriveThreadId("conversation-1");
  const first = convertToLangChainMessages([
    { role: "system", content: "system" },
    { role: "user", id: "u1", content: "create a PDF" },
  ]);
  let state = await submitIncrementally(graph, thread, first);
  assert.equal(new Set(state.map((m) => m.id)).size, state.length);
  state = await submitIncrementally(graph, thread, [
    ...first,
    new HumanMessage({ id: "u2", content: "make it blue" }),
  ]);
  const afterTurn2 = state.length;
  state = await submitIncrementally(graph, thread, [
    ...first,
    new HumanMessage({ id: "u2", content: "make it blue" }),
  ]);
  assert.equal(
    state.length,
    afterTurn2,
    "retry must update/dedupe, not append the visible window",
  );
  assert.equal(state.filter((m) => m.id === "u1").length, 1);
});

test("create -> edit -> edit -> edit grows only by genuinely new turns", async () => {
  const graph = compile();
  const thread = deriveThreadId("conversation-2");
  let previous = 0;
  for (let i = 0; i < 4; i++) {
    const state = await submitIncrementally(graph, thread, [
      new HumanMessage({
        id: `u${i}`,
        content: i ? `edit ${i}` : "create pdf",
      }),
    ]);
    assert.equal(state.length, previous + 2);
    assert.equal(new Set(state.map((m) => m.id)).size, state.length);
    previous = state.length;
  }
});

test("branch thread isolates edit/regenerate history", async () => {
  const graph = compile();
  const root = deriveThreadId("conversation-3");
  await submitIncrementally(graph, root, [
    new HumanMessage({ id: "u1", content: "original" }),
  ]);
  const branch = deriveThreadId("conversation-3", "edit-u1");
  await submitIncrementally(graph, branch, [
    new HumanMessage({ id: "u1", content: "replacement" }),
  ]);
  const rootState = await graph.getState({ configurable: { thread_id: root } });
  const branchState = await graph.getState({
    configurable: { thread_id: branch },
  });
  assert.equal(
    (rootState.values.messages[0] as HumanMessage).content,
    "original",
  );
  assert.equal(
    (branchState.values.messages[0] as HumanMessage).content,
    "replacement",
  );
});

test("bounded model context preserves the newest complete create_pdf pair", () => {
  const huge =
    "PDF specification section with varied words and values. ".repeat(120);
  const call = new AIMessage({
    id: "pdf-call",
    content: "",
    tool_calls: [{ id: "c-pdf", name: "create_pdf", args: { spec: huge } }],
  });
  const result = new ToolMessage({
    id: "pdf-result",
    tool_call_id: "c-pdf",
    content: "created",
  });
  const noise = Array.from(
    { length: 5 },
    (_, i) => new HumanMessage({ id: `n${i}`, content: huge }),
  );
  const bounded = buildBoundedModelContext(
    new SystemMessage("system"),
    [
      call,
      result,
      ...noise,
      new HumanMessage({ id: "edit", content: "edit the PDF title" }),
    ],
    "gpt-4o-mini",
    4_000,
  );
  assert.equal(bounded.protectedPdfPairs, 1);
  assert.ok(bounded.trimmed > 0);
  assert.ok(bounded.messages.some((m) => m.id === "pdf-call"));
  assert.ok(
    bounded.messages.some(
      (m) => m instanceof ToolMessage && m.tool_call_id === "c-pdf",
    ),
  );
  const callIds = new Set(
    bounded.messages.flatMap((m) =>
      m instanceof AIMessage
        ? (m.tool_calls ?? []).flatMap((c) => (c.id ? [c.id] : []))
        : [],
    ),
  );
  for (const message of bounded.messages)
    if (message instanceof ToolMessage)
      assert.ok(callIds.has(message.tool_call_id));
});

test("id-less fallback does not renumber when the visible window shifts", () => {
  const earlier = convertToLangChainMessages([
    { role: "user", content: "continue", timestamp: 1 },
    { role: "assistant", content: "ok", timestamp: 2 },
    { role: "user", content: "continue", timestamp: 3 },
  ]);
  const shifted = convertToLangChainMessages([
    { role: "assistant", content: "ok", timestamp: 2 },
    { role: "user", content: "continue", timestamp: 3 },
  ]);
  assert.equal(earlier[2].id, shifted[1].id);
  assert.notEqual(earlier[0].id, earlier[2].id);
});

test("timestamp-less identical fallback messages never collide", () => {
  const converted = convertToLangChainMessages([
    { role: "user", content: "continue" },
    { role: "user", content: "continue" },
  ]);
  assert.notEqual(converted[0].id, converted[1].id);
});

test("same-id corrections are distinct while byte-identical retries are idempotent", () => {
  const original = new HumanMessage({ id: "u-correct", content: "first" });
  const retry = new HumanMessage({ id: "u-correct", content: "first" });
  const correction = new HumanMessage({
    id: "u-correct",
    content: "corrected",
  });
  assert.equal(messageFingerprint(original), messageFingerprint(retry));
  assert.notEqual(messageFingerprint(original), messageFingerprint(correction));
});

test("ephemeral reference context stays outside durable checkpoint input", async () => {
  const graph = compile();
  const thread = deriveThreadId("conversation-ephemeral");
  const durable = convertToLangChainMessages([
    { role: "user", id: "u-private", content: "summarize this" },
  ]);
  const ephemeral = convertToLangChainMessages([
    {
      role: "user",
      content: "<reference_context>private document</reference_context>",
    },
  ]);
  assert.equal(ephemeral.length, 1);
  await submitIncrementally(graph, thread, durable);
  const state = await graph.getState({ configurable: { thread_id: thread } });
  assert.equal(
    state.values.messages.some((message: BaseMessage) =>
      String(message.content).includes("private document"),
    ),
    false,
  );
});

test("tool-call arguments count toward the model budget", () => {
  const huge = "large specification ".repeat(2_000);
  const call = new AIMessage({
    id: "large-call",
    content: "",
    tool_calls: [{ id: "c-large", name: "create_pdf", args: { spec: huge } }],
  });
  assert.throws(
    () =>
      buildBoundedModelContext(
        new SystemMessage("system"),
        [
          call,
          new ToolMessage({
            id: "large-result",
            tool_call_id: "c-large",
            content: "created",
          }),
          new HumanMessage({ id: "edit", content: "edit the PDF" }),
        ],
        "gpt-4o-mini",
        1_000,
      ),
    /exceeds the model token budget/,
  );
});

test("long branch IDs preserve a collision-resistant suffix", () => {
  const shared = "x".repeat(190);
  const first = deriveThreadId("conversation", `${shared}a`);
  const second = deriveThreadId("conversation", `${shared}b`);
  assert.notEqual(first, second);
  assert.ok(first.length <= "conv-conversation:branch:".length + 160);
});

test(
  "PostgresSaver integration (real DB when TEST_DATABASE_URL is present)",
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    const { PostgresSaver } =
      await import("@langchain/langgraph-checkpoint-postgres");
    const saver = PostgresSaver.fromConnString(process.env.TEST_DATABASE_URL!, {
      schema: `checkpoint_e2e_${Date.now()}`,
    });
    await saver.setup();
    try {
      const graph = compile(saver);
      const thread = deriveThreadId(`postgres-${Date.now()}`);
      for (let i = 0; i < 4; i++)
        await submitIncrementally(graph, thread, [
          new HumanMessage({
            id: `pg-u${i}`,
            content: i ? "edit PDF" : "create PDF",
          }),
        ]);
      const state = await graph.getState({
        configurable: { thread_id: thread },
      });
      assert.equal(state.values.messages.length, 8);
      assert.equal(
        new Set(state.values.messages.map((m: BaseMessage) => m.id)).size,
        8,
      );
      await saver.deleteThread(thread);
    } finally {
      await saver.end();
    }
  },
);
