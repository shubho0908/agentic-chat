import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { AIMessage, HumanMessage, ToolMessage, type BaseMessage } from "@langchain/core/messages";
import { Command, END, MemorySaver, StateGraph, interrupt } from "@langchain/langgraph";

import { AgentState, type AgentStateType } from "@/lib/orchestrator/state";
import { createFinalAnswerNode } from "@/lib/orchestrator/nodes/agent";
import { buildRecoveryMessage, classifyRecovery, routeAfterAgent } from "@/lib/orchestrator/nodes/reflector";
import { createStreamEventMapper } from "@/lib/orchestrator/streaming";
import { extractText } from "@/lib/orchestrator/nodes/planner";
import {
  GRAPH_RUN_LIMITS,
  closeTurnAtStepLimit,
  isGraphRecursionError,
} from "@/lib/orchestrator/stepLimit";
import { GraphNode, MAX_TOOL_ROUNDS, RECURSION_LIMIT, RecoveryReason } from "@/lib/orchestrator/constants";
import type { StreamWriter } from "@/lib/chat/safeStream";
import { ACTIVITY_ONLY_ASSISTANT_CONTENT, getPersistableAssistantContent } from "@/hooks/chat/conversationManager";
import { shouldAutoContinueConversation } from "@/hooks/chat/autoContinue";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ChatMessage } from "@/components/chat/chatMessage";
import { MessageRole, type Message } from "@/lib/schemas/chat";

const MODEL = "gpt-5.6-luna";

type AgentBehavior = (call: number, state: AgentStateType) => AIMessage;
type ToolBehavior = (toolCall: { id?: string; name: string }, round: number) => string;

type InputItem = { type?: string; role?: string; content?: unknown; call_id?: string };

interface CapturedRequest {
  body: { input: InputItem[]; tools?: unknown };
}

let completionCount = 0;

function completionStream(text: string): Response {
  const responseId = `resp_final_${++completionCount}`;
  const event = (payload: Record<string, unknown>) =>
    `event: ${payload.type}\ndata: ${JSON.stringify(payload)}\n\n`;
  const item = { id: `msg_final_${completionCount}`, type: "message", role: "assistant" };
  const body = [
    event({ type: "response.created", response: { id: responseId, object: "response", created_at: 1, model: MODEL, status: "in_progress", output: [] } }),
    event({ type: "response.output_item.added", output_index: 0, item: { ...item, status: "in_progress", content: [] } }),
    ...text.split(/(?<= )/).map((delta) =>
      event({ type: "response.output_text.delta", item_id: item.id, output_index: 0, content_index: 0, delta }),
    ),
    event({
      type: "response.completed",
      response: {
        id: responseId,
        object: "response",
        created_at: 1,
        model: MODEL,
        status: "completed",
        output: [{ ...item, status: "completed", content: [{ type: "output_text", text, annotations: [] }] }],
        usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
      },
    }),
  ].join("");
  return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

function systemText(request: CapturedRequest): string {
  const system = request.body.input.find((item) => item.role === "system" || item.role === "developer");
  return JSON.stringify(system?.content ?? "");
}

function stubModel(respond: (request: CapturedRequest) => Response | Promise<Response>) {
  const requests: CapturedRequest[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (!url.endsWith("/responses")) return new Response("", { status: 404 });
    const rawBody = input instanceof Request ? await input.text() : String(init?.body ?? "{}");
    const request = { body: JSON.parse(rawBody) } as CapturedRequest;
    requests.push(request);
    return respond(request);
  }) as typeof fetch;
  return { requests, restore: () => { globalThis.fetch = original; } };
}

function toolCallingAgent(name = "web_search"): AgentBehavior {
  return (call) =>
    new AIMessage({ content: "", tool_calls: [{ id: `call-${call}`, name, args: { query: `q${call}` } }] });
}

function buildGraph(options: {
  agent: AgentBehavior;
  tool?: ToolBehavior;
  interruptOnRound?: number;
}) {
  let agentCalls = 0;
  let toolRounds = 0;
  const tool: ToolBehavior = options.tool ?? ((toolCall) => `result for ${toolCall.id}`);
  const graph = new StateGraph(AgentState)
    .addNode(GraphNode.PLANNER, async () => ({ messages: [] }))
    .addNode(GraphNode.AGENT, async (state: AgentStateType) => {
      agentCalls += 1;
      return { messages: [options.agent(agentCalls, state)] };
    })
    .addNode(GraphNode.TOOLS, async (state: AgentStateType) => {
      const last = state.messages[state.messages.length - 1] as AIMessage;
      const round = toolRounds + 1;
      if (round === options.interruptOnRound) interrupt({ requestKind: "approval" });
      toolRounds = round;
      return {
        messages: (last.tool_calls ?? []).map((toolCall) => {
          const content = tool(toolCall, round);
          return new ToolMessage({
            tool_call_id: toolCall.id ?? "",
            name: toolCall.name,
            content,
            ...(content.startsWith("Tool execution failed") ? { status: "error" as const } : {}),
          });
        }),
      };
    })
    .addNode(GraphNode.RECOVERY, createFinalAnswerNode("test-key", MODEL))
    .addEdge("__start__", GraphNode.PLANNER)
    .addEdge(GraphNode.PLANNER, GraphNode.AGENT)
    .addConditionalEdges(GraphNode.AGENT, routeAfterAgent, {
      tools: GraphNode.TOOLS,
      recovery: GraphNode.RECOVERY,
      [END]: END,
    })
    .addEdge(GraphNode.TOOLS, GraphNode.AGENT)
    .addEdge(GraphNode.RECOVERY, END)
    .compile({ checkpointer: new MemorySaver() });
  return { graph, agentCalls: () => agentCalls };
}

function createWriter() {
  const events: Array<Record<string, unknown>> = [];
  const decoder = new TextDecoder();
  const writer = {
    enqueue(chunk: Uint8Array) {
      for (const line of decoder.decode(chunk).split("\n")) {
        if (line.startsWith("data: ")) events.push(JSON.parse(line.slice(6)));
      }
    },
  } as unknown as StreamWriter;
  const text = () =>
    events
      .filter((event) => typeof event.content === "string" && !event.type)
      .map((event) => event.content as string)
      .join("");
  return { writer, events, text };
}

async function runTurn(
  graph: ReturnType<typeof buildGraph>["graph"],
  threadId: string,
  input: unknown,
  limits: { recursionLimit: number } = GRAPH_RUN_LIMITS,
) {
  const sink = createWriter();
  const mapper = createStreamEventMapper();
  const config = { configurable: { thread_id: threadId } };
  let error: unknown = null;
  try {
    const events = await graph.streamEvents(input as never, { ...config, ...limits, version: "v2" });
    for await (const event of events) mapper.map(sink.writer, event as Record<string, unknown>);
    const state = await graph.getState(config);
    if ((state.tasks ?? []).every((task) => (task.interrupts ?? []).length === 0)) {
      mapper.ensureTerminalAnswer(sink.writer, state.values.messages);
    }
  } catch (caught) {
    error = caught;
    if (isGraphRecursionError(caught)) {
      await closeTurnAtStepLimit(
        graph as never,
        createFinalAnswerNode("sk-test", MODEL),
        threadId,
        sink.writer,
        mapper,
        new AbortController().signal,
        {},
      );
      error = null;
    }
  }
  mapper.flush(sink.writer);
  const state = await graph.getState(config);
  return { ...sink, error, state, last: state.values.messages.at(-1) as BaseMessage };
}

const userTurn = (text: string) => ({ messages: [new HumanMessage(text)], userId: "u" });

test("step budget always leaves room for every tool round plus planner, agent and final answer", () => {
  assert.equal(MAX_TOOL_ROUNDS, 20);
  assert.ok(RECURSION_LIMIT >= 2 * MAX_TOOL_ROUNDS + 3);
});

test("every graph stream call site runs with the shared step budget", () => {
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) {
        walk(path);
        continue;
      }
      if (!/\.tsx?$/.test(entry)) continue;
      const source = readFileSync(path, "utf8");
      for (const match of source.matchAll(/\.streamEvents\(/g)) {
        const call = source.slice(match.index, match.index + 600);
        if (!call.includes("GRAPH_RUN_LIMITS")) offenders.push(path);
      }
    }
  };
  walk(join(process.cwd(), "app"));
  walk(join(process.cwd(), "lib"));
  assert.deepEqual(offenders, []);
});

test("round limit ends with a streamed, persisted answer synthesized from gathered results", async () => {
  const model = stubModel(() => completionStream("Here is what I found so far. Ask me to continue for the rest."));
  try {
    const { graph, agentCalls } = buildGraph({ agent: toolCallingAgent() });
    const run = await runTurn(graph, "round-limit", userTurn("compare every vendor"));

    assert.equal(run.error, null);
    assert.equal(agentCalls(), MAX_TOOL_ROUNDS);
    assert.equal(run.text(), "Here is what I found so far. Ask me to continue for the rest.");
    assert.equal(run.events.filter((event) => "error" in event).length, 0);
    assert.equal(run.last.type, "ai");
    assert.equal(((run.last as AIMessage).tool_calls ?? []).length, 0);
    assert.equal(extractText(run.last.content), run.text());
    assert.deepEqual(run.state.next, []);

    assert.equal(model.requests.length, 1);
    const request = model.requests[0];
    assert.equal(request.body.tools, undefined);
    assert.match(systemText(request), /Final answer required/);
    assert.match(systemText(request), new RegExp(`${MAX_TOOL_ROUNDS} rounds`));
    const outputs = request.body.input.filter((item) => item.type === "function_call_output");
    const calls = request.body.input.filter((item) => item.type === "function_call");
    assert.equal(outputs.length, MAX_TOOL_ROUNDS - 1);
    assert.deepEqual(calls.map((item) => item.call_id), outputs.map((item) => item.call_id));
  } finally {
    model.restore();
  }
});

test("round limit falls back to a deterministic answer when the final model call fails", async () => {
  const model = stubModel(() => new Response(JSON.stringify({ error: { message: "bad key" } }), { status: 401 }));
  try {
    const { graph } = buildGraph({ agent: toolCallingAgent() });
    const run = await runTurn(graph, "round-limit-fallback", userTurn("compare every vendor"));

    assert.equal(run.error, null);
    assert.equal(run.events.filter((event) => "error" in event).length, 0);
    assert.match(run.text(), /step limit/);
    assert.equal(run.last.content, run.text());
    assert.equal(((run.last as AIMessage).tool_calls ?? []).length, 0);
  } finally {
    model.restore();
  }
});

test("an empty final model answer falls back instead of ending blank", async () => {
  const model = stubModel(() => completionStream("   "));
  try {
    const { graph } = buildGraph({ agent: toolCallingAgent() });
    const run = await runTurn(graph, "empty-final", userTurn("compare every vendor"));

    assert.match(run.text(), /step limit/);
    assert.equal(run.last.content, run.text());
  } finally {
    model.restore();
  }
});

test("a user stop during the final answer propagates as an abort, never a fallback", async () => {
  const controller = new AbortController();
  const model = stubModel(() => {
    controller.abort();
    throw Object.assign(new Error("aborted"), { name: "AbortError" });
  });
  try {
    const { graph } = buildGraph({ agent: toolCallingAgent() });
    await assert.rejects(async () => {
      const events = await graph.streamEvents(userTurn("compare every vendor") as never, {
        configurable: { thread_id: "abort-final" },
        ...GRAPH_RUN_LIMITS,
        signal: controller.signal,
        version: "v2",
      });
      for await (const event of events) void event;
    });
  } finally {
    model.restore();
  }
});

test("an empty agent answer is recovered into a real answer", async () => {
  const model = stubModel(() => completionStream("The answer is 42."));
  try {
    const { graph, agentCalls } = buildGraph({
      agent: (call) => (call === 1 ? toolCallingAgent()(call, {} as AgentStateType) : new AIMessage({ content: "" })),
    });
    const run = await runTurn(graph, "empty-answer", userTurn("what is the answer"));

    assert.equal(agentCalls(), 2);
    assert.equal(run.text(), "The answer is 42.");
    assert.match(systemText(model.requests[0]), /previous reply was empty/);
    assert.equal(model.requests[0].body.input.at(-1)?.type, "function_call_output");
  } finally {
    model.restore();
  }
});

test("a repeating tool failure loop ends with a synthesized answer naming the failure", async () => {
  const model = stubModel(() => completionStream("The refund tool kept failing, so I could not finish."));
  try {
    const { graph, agentCalls } = buildGraph({
      agent: (call) => new AIMessage({ content: "", tool_calls: [{ id: `r${call}`, name: "get_refund", args: { id: "1" } }] }),
      tool: () => "Tool execution failed: boom",
    });
    const run = await runTurn(graph, "failure-loop", userTurn("refund order 1"));

    assert.ok(agentCalls() < MAX_TOOL_ROUNDS);
    assert.equal(run.text(), "The refund tool kept failing, so I could not finish.");
    assert.match(systemText(model.requests[0]), /kept failing/);
  } finally {
    model.restore();
  }
});

test("a resumed approval turn reaches the round limit gracefully instead of the default step cap", async () => {
  const model = stubModel(() => completionStream("Done with what I could gather after approval."));
  try {
    const { graph, agentCalls } = buildGraph({ agent: toolCallingAgent("gmail_send"), interruptOnRound: 1 });
    const first = await runTurn(graph, "approval", userTurn("email everyone"));
    assert.equal(first.error, null);
    assert.equal(first.text(), "");
    assert.ok((first.state.tasks ?? []).some((task) => (task.interrupts ?? []).length > 0));

    const resumed = await runTurn(graph, "approval", new Command({ resume: "approved" }));
    assert.equal(resumed.error, null);
    assert.equal(agentCalls(), MAX_TOOL_ROUNDS);
    assert.equal(resumed.text(), "Done with what I could gather after approval.");
    assert.equal(resumed.events.filter((event) => "error" in event).length, 0);
  } finally {
    model.restore();
  }
});

test("the langgraph default step cap would have broken the same resumed turn", async () => {
  const model = stubModel(() => completionStream("unused"));
  try {
    const { graph } = buildGraph({ agent: toolCallingAgent("gmail_send"), interruptOnRound: 1 });
    await runTurn(graph, "approval-default", userTurn("email everyone"));
    const config = { configurable: { thread_id: "approval-default" } };
    await assert.rejects(async () => {
      const events = await graph.streamEvents(new Command({ resume: "approved" }), { ...config, version: "v2" });
      for await (const event of events) void event;
    }, (error: unknown) => isGraphRecursionError(error));
  } finally {
    model.restore();
  }
});

test("hitting the graph step cap answers from the gathered results with a resolved checkpoint", async () => {
  const model = stubModel(() => completionStream("Here is what the searches found."));
  try {
    const { graph } = buildGraph({ agent: toolCallingAgent() });
    const run = await runTurn(graph, "step-cap", userTurn("go"), { recursionLimit: 6 });

    assert.equal(run.error, null);
    assert.equal(run.text(), "Here is what the searches found.");
    assert.equal(extractText(run.last.content), "Here is what the searches found.");
    assert.deepEqual(run.state.next, []);
    const finalRequest = model.requests.at(-1)!;
    assert.equal(finalRequest.body.tools, undefined);
    assert.ok(finalRequest.body.input.some((item) => item.type === "function_call_output"));
    assert.ok(JSON.stringify(finalRequest.body.input).includes("every step it is allowed"));

    let followUpCalls = 0;
    const next = await runTurn(graph, "step-cap", userTurn("continue"));
    followUpCalls = next.state.values.messages.filter((message: BaseMessage) => message.type === "human").length;
    assert.equal(followUpCalls, 2);
    assert.equal(next.error, null);
    assert.ok(next.text().length > 0);
  } finally {
    model.restore();
  }
});

test("recovery reasons are classified from the turn shape", () => {
  const rounds = (count: number) =>
    Array.from({ length: count }, (_, index) =>
      new AIMessage({ content: "", tool_calls: [{ id: `c${index}`, name: "t", args: {} }] }),
    );
  assert.equal(classifyRecovery([new HumanMessage("x"), ...rounds(MAX_TOOL_ROUNDS)]), RecoveryReason.ROUND_LIMIT);
  assert.equal(classifyRecovery([new HumanMessage("x"), ...rounds(3)]), RecoveryReason.TOOL_FAILURES);
  assert.equal(classifyRecovery([new HumanMessage("x"), new AIMessage({ content: "" })]), RecoveryReason.EMPTY_ANSWER);
  assert.match(buildRecoveryMessage([new HumanMessage("x"), new AIMessage({ content: "" })]), /answer/);
});

test("routing treats whitespace and reasoning-only answers as empty and real text as final", () => {
  const route = (message: AIMessage) =>
    routeAfterAgent({ messages: [new HumanMessage("x"), message] } as AgentStateType);
  assert.equal(route(new AIMessage({ content: "  \n" })), GraphNode.RECOVERY);
  assert.equal(route(new AIMessage({ content: [{ type: "reasoning", reasoning: "hmm" }] as never })), GraphNode.RECOVERY);
  assert.equal(route(new AIMessage({ content: "fine" })), END);
  assert.equal(route(new AIMessage({ content: [{ type: "text", text: "fine" }] })), END);
});

function streamChunk(node: string, content: unknown) {
  return { event: "on_chat_model_stream", metadata: { langgraph_node: node }, data: { chunk: { content } } };
}

test("the stream never drops, duplicates or loses the terminal answer", () => {
  const answer = new AIMessage({ content: "Final words." });

  const streamed = createWriter();
  const mapperA = createStreamEventMapper();
  mapperA.map(streamed.writer, streamChunk(GraphNode.AGENT, "Final "));
  mapperA.map(streamed.writer, streamChunk(GraphNode.AGENT, "words."));
  assert.equal(mapperA.ensureTerminalAnswer(streamed.writer, [answer]), false);
  mapperA.flush(streamed.writer);
  assert.equal(streamed.text(), "Final words.");

  const recovery = createWriter();
  const mapperB = createStreamEventMapper();
  mapperB.map(recovery.writer, streamChunk(GraphNode.RECOVERY, "Failed attempt that was re"));
  assert.equal(recovery.events.length, 0);
  assert.equal(mapperB.ensureTerminalAnswer(recovery.writer, [answer]), true);
  mapperB.flush(recovery.writer);
  assert.equal(recovery.text(), "Final words.");

  const silent = createWriter();
  const mapperC = createStreamEventMapper();
  assert.equal(mapperC.ensureTerminalAnswer(silent.writer, [answer]), true);
  mapperC.flush(silent.writer);
  assert.equal(silent.text(), "Final words.");

  const partial = createWriter();
  const mapperD = createStreamEventMapper();
  mapperD.map(partial.writer, streamChunk(GraphNode.AGENT, "Half an ans"));
  assert.equal(mapperD.ensureTerminalAnswer(partial.writer, [answer]), true);
  mapperD.flush(partial.writer);
  assert.equal(partial.text(), "Half an ans\n\nFinal words.");

  const retried = createWriter();
  const mapperE = createStreamEventMapper();
  mapperE.map(retried.writer, streamChunk(GraphNode.AGENT, "Final words."));
  mapperE.map(retried.writer, streamChunk(GraphNode.AGENT, "Final words."));
  assert.equal(mapperE.ensureTerminalAnswer(retried.writer, [answer]), false);

  const blocks = createWriter();
  const mapperF = createStreamEventMapper();
  mapperF.map(blocks.writer, streamChunk(GraphNode.AGENT, [{ type: "text", text: "Final" }]));
  mapperF.map(blocks.writer, streamChunk(GraphNode.AGENT, [{ type: "text", text: "words." }]));
  assert.equal(
    mapperF.ensureTerminalAnswer(blocks.writer, [new AIMessage({ content: [{ type: "text", text: "Final" }, { type: "text", text: "words." }] })]),
    false,
  );

  const beforeTools = createWriter();
  const mapperG = createStreamEventMapper();
  mapperG.map(beforeTools.writer, streamChunk(GraphNode.AGENT, "Final words."));
  mapperG.map(beforeTools.writer, { event: "on_tool_start", name: "web_search", run_id: "r1", metadata: { langgraph_node: GraphNode.TOOLS }, data: { input: {} } });
  assert.equal(mapperG.ensureTerminalAnswer(beforeTools.writer, [answer]), true);

  const pending = createWriter();
  const mapperH = createStreamEventMapper();
  const toolCalling = new AIMessage({ content: "", tool_calls: [{ id: "c", name: "t", args: {} }] });
  assert.equal(mapperH.ensureTerminalAnswer(pending.writer, [toolCalling]), false);
  assert.equal(mapperH.ensureTerminalAnswer(pending.writer, [new HumanMessage("x")]), false);
  assert.equal(mapperH.ensureTerminalAnswer(pending.writer, []), false);
  assert.equal(mapperH.ensureTerminalAnswer(pending.writer, undefined), false);
  assert.equal(pending.events.length, 0);

  const spaced = createWriter();
  const mapperJ = createStreamEventMapper();
  for (const piece of ["Line one", "\n\n", "    ", "Line two", "\n"]) {
    mapperJ.map(spaced.writer, streamChunk(GraphNode.AGENT, piece));
  }
  mapperJ.flush(spaced.writer);
  assert.equal(spaced.text(), "Line one\n\n    Line two\n");

  const blankThenFallback = createWriter();
  const mapperK = createStreamEventMapper();
  mapperK.map(blankThenFallback.writer, streamChunk(GraphNode.AGENT, "    "));
  assert.equal(mapperK.ensureTerminalAnswer(blankThenFallback.writer, [answer]), true);
  mapperK.flush(blankThenFallback.writer);
  assert.equal(blankThenFallback.text(), "Final words.");

  const planner = createWriter();
  const mapperI = createStreamEventMapper();
  mapperI.map(planner.writer, streamChunk(GraphNode.PLANNER, "{\"complexity\":\"direct\"}"));
  assert.equal(planner.events.length, 0);
});

test("errored turns persist streamed tool activity and thinking", () => {
  const activity = { toolCallId: "t1", toolName: "web_search", status: "completed", args: {}, timestamp: 1 };
  assert.equal(getPersistableAssistantContent("", undefined), null);
  assert.equal(getPersistableAssistantContent("   ", { thinking: "  " } as never), null);
  assert.equal(getPersistableAssistantContent("partial", undefined), "partial");
  assert.equal(getPersistableAssistantContent("", { toolActivities: [activity] } as never), ACTIVITY_ONLY_ASSISTANT_CONTENT);
  assert.equal(getPersistableAssistantContent("", { thinking: "thinking about it" } as never), ACTIVITY_ONLY_ASSISTANT_CONTENT);
});

test("the activity-only placeholder never renders as text", () => {
  const html = renderToStaticMarkup(
    createElement(ChatMessage, {
      message: {
        id: "a1",
        role: MessageRole.ASSISTANT,
        content: ACTIVITY_ONLY_ASSISTANT_CONTENT,
        metadata: { streamStatus: "error", streamError: "boom", thinking: "checked the inbox" },
      },
    }),
  );
  assert.ok(html.includes("Response interrupted"));
  assert.ok(!html.includes("activity_only"));
});

test("an errored turn is never silently auto-retried", () => {
  const user: Message = { id: "u1", role: MessageRole.USER, content: "hi" };
  const errored: Message = {
    id: "a1",
    role: MessageRole.ASSISTANT,
    content: "",
    toolActivities: [],
    metadata: { streamStatus: "error", streamError: "boom" },
  };
  assert.equal(shouldAutoContinueConversation([user, errored]), false);
  assert.equal(shouldAutoContinueConversation([user, { ...errored, metadata: undefined }]), true);
});
