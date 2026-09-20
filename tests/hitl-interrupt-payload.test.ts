/**
 * Integration tests: interrupts raised by the tools node carry the
 * model + reasoning effort that created them, inside a real graph run.
 *
 * LangGraph only attaches interrupt payloads during an actual graph
 * execution with a checkpointer, so each test runs a minimal real graph
 * (StateGraph + MemorySaver) containing the production tools node and
 * reads the persisted interrupt out of the checkpointed state.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { AIMessage } from "@langchain/core/messages";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { StateGraph, MemorySaver, START, END } from "@langchain/langgraph";
import { z } from "zod";
import { createToolNode } from "@/lib/orchestrator/nodes/tools";
import { ASK_USER_TOOL_NAME } from "@/lib/orchestrator/tools";
import { AgentState } from "@/lib/orchestrator/state";
import type { ReasoningEffortLevel } from "@/constants/openai-models";

// Composio Gmail send slug; deterministic dangerous-action blocklist entry
// (lib/tools/composio/config.ts).
const GMAIL_SEND_EMAIL_SLUG = "GMAIL_SEND_EMAIL";

interface InterruptValue {
  type: string;
  requestKind?: string;
  model?: string | null;
  reasoningEffort?: string | null;
  toolCallId?: string;
  actionId?: string;
}

function noopTool(name: string): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name,
    description: "test tool",
    schema: z.object({}).passthrough(),
    func: async () => "should never run",
  });
}

/**
 * Runs one tools-node graph step with the given tool call + orchestrator
 * config and returns the interrupt payload persisted in the checkpoint.
 */
async function runInterruptingCall(params: {
  toolName: string;
  toolCallId: string;
  args: Record<string, unknown>;
  orchestratorConfig?: { model: string; reasoningEffort?: ReasoningEffortLevel };
}): Promise<InterruptValue> {
  const graph = new StateGraph(AgentState)
    .addNode("tools", createToolNode([noopTool(params.toolName)], params.orchestratorConfig ?? { model: "gpt-5.6-sol" }))
    .addEdge(START, "tools")
    .addEdge("tools", END)
    .compile({ checkpointer: new MemorySaver() });

  const config = { configurable: { thread_id: `test-${crypto.randomUUID()}` } };
  await graph.invoke(
    {
      jevHitlEscalation: null,
      messages: [
        new AIMessage({
          content: "",
          tool_calls: [{ id: params.toolCallId, name: params.toolName, args: params.args }],
        }),
      ],
    },
    config,
  );

  const state = await graph.getState(config);
  const interrupts = state.tasks.flatMap((task) => task.interrupts);
  assert.equal(interrupts.length, 1, "exactly one interrupt expected");
  return interrupts[0].value as InterruptValue;
}

test("ASK_USER interrupt persists the creating model and effort", async () => {
  const value = await runInterruptingCall({
    toolName: ASK_USER_TOOL_NAME,
    toolCallId: "call_ask_1",
    args: { question: "what color?" },
    orchestratorConfig: { model: "gpt-5.6-sol", reasoningEffort: "high" },
  });
  assert.equal(value.type, "hitl_request");
  assert.equal(value.requestKind, "ask_user");
  assert.equal(value.model, "gpt-5.6-sol");
  assert.equal(value.reasoningEffort, "high");
  assert.equal(value.toolCallId, "call_ask_1");
});

test("APPROVAL interrupt (dangerous action) persists the creating model and effort", async () => {
  const value = await runInterruptingCall({
    toolName: GMAIL_SEND_EMAIL_SLUG,
    toolCallId: "call_gmail_1",
    args: { to: "a@b.com", subject: "s", body: "b", gmailSendEmail: true, emailFrom: "a@b.com" },
    orchestratorConfig: { model: "gpt-5.5", reasoningEffort: "xhigh" },
  });
  assert.equal(value.type, "hitl_request");
  assert.equal(value.requestKind, "approval");
  assert.equal(value.model, "gpt-5.5");
  assert.equal(value.reasoningEffort, "xhigh");
});

test("interrupt without an explicit effort persists null, not undefined", async () => {
  const value = await runInterruptingCall({
    toolName: ASK_USER_TOOL_NAME,
    toolCallId: "call_ask_2",
    args: { question: "q" },
    orchestratorConfig: { model: "gpt-5.6-sol" },
  });
  assert.equal(value.model, "gpt-5.6-sol");
  assert.ok("reasoningEffort" in value, "payload carries the reasoningEffort field");
  assert.equal(value.reasoningEffort, null);
});
