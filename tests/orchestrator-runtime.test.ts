import test from "node:test";
import assert from "node:assert/strict";

import { AIMessage, ToolMessage } from "@langchain/core/messages";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { END } from "@langchain/langgraph";
import { z } from "zod";

import { toJsonValue } from "@/lib/json";
import { parsePaginationInteger } from "@/lib/pagination";
import { encodeToolResult } from "@/lib/chat/streamingHelpers";
import { MAX_TOOL_ITERATIONS } from "@/lib/orchestrator/constants";
import { routeAfterAgent } from "@/lib/orchestrator/nodes/reflector";
import { ASK_USER_TOOL_NAME, filterToolsForContext } from "@/lib/orchestrator/tools";
import type { AgentStateType } from "@/lib/orchestrator/state";
import { ToolName } from "@/lib/tools/constants";
import { RoutingDecision } from "@/types/chat";
import { isDangerousAction } from "@/lib/tools/composio/config";

function createTool(name: string): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name,
    description: `${name} test tool`,
    schema: z.object({}),
    func: async () => "ok",
  });
}

function createToolCallingMessage(id: string): AIMessage {
  return new AIMessage({
    content: "",
    tool_calls: [{ id, name: "test_tool", args: {} }],
  });
}

test("URL-content tool filtering keeps web search available under the registered tool name", () => {
  const tools = [
    createTool(ASK_USER_TOOL_NAME),
    createTool(ToolName.WEB_SEARCH),
    createTool(ToolName.WEB_SCRAPE),
    createTool("GITHUB_LIST_REPOS"),
  ];

  const filtered = filterToolsForContext(tools, RoutingDecision.UrlContent);

  assert.deepEqual(
    filtered.map((tool) => tool.name),
    [ASK_USER_TOOL_NAME, ToolName.WEB_SEARCH, ToolName.WEB_SCRAPE]
  );
});

test("tool routing limits execution rounds, not parallel tool result count", () => {
  const firstRoundCallId = "call-first";
  const messages = [
    createToolCallingMessage(firstRoundCallId),
    ...Array.from({ length: MAX_TOOL_ITERATIONS + 4 }, (_, index) =>
      new ToolMessage({
        content: "ok",
        tool_call_id: `${firstRoundCallId}-${index}`,
      })
    ),
    createToolCallingMessage("call-second"),
  ];

  assert.equal(routeAfterAgent({ messages } as AgentStateType), "tools");
});

test("tool routing stops after the configured number of request rounds", () => {
  const messages = Array.from({ length: MAX_TOOL_ITERATIONS + 1 }, (_, index) =>
    createToolCallingMessage(`call-${index}`)
  );

  assert.equal(routeAfterAgent({ messages } as AgentStateType), END);
});

test("toJsonValue preserves metadata without throwing on circular or non-JSON values", () => {
  const value: Record<string, unknown> = {
    id: BigInt(1),
    createdAt: new Date("2026-05-31T00:00:00.000Z"),
    run: function runTool() {
      return "unused";
    },
  };
  value.self = value;

  assert.deepEqual(toJsonValue(value), {
    id: "1",
    createdAt: "2026-05-31T00:00:00.000Z",
    run: "[Function: runTool]",
    self: "[Circular]",
  });
});

test("Composio dangerous-action detection covers generic write and destructive verbs", () => {
  assert.equal(isDangerousAction("GMAIL_SEND_EMAIL"), true);
  assert.equal(isDangerousAction("github_create_issue"), true);
  assert.equal(isDangerousAction("GOOGLESHEETS_APPEND_ROW"), true);
  assert.equal(isDangerousAction("SLACK_LIST_CHANNELS"), false);
  assert.equal(isDangerousAction("GMAIL_SEARCH_EMAILS"), false);
});

test("pagination integer parsing clamps unsafe route query values", () => {
  assert.equal(parsePaginationInteger("25", 10), 25);
  assert.equal(parsePaginationInteger("-5", 10), 10);
  assert.equal(parsePaginationInteger("100000", 10), 100);
  assert.equal(parsePaginationInteger("abc", 10), 10);
  assert.equal(parsePaginationInteger("0", 10, { min: 0 }), 0);
});

test("SSE tool result encoding handles non-JSON-safe payloads", () => {
  const result: Record<string, unknown> = { value: BigInt(7) };
  result.self = result;

  const encoded = new TextDecoder().decode(encodeToolResult("test", "call-1", result));

  assert.match(encoded, /^data: /);
  assert.match(encoded, /"value":"7"/);
  assert.match(encoded, /"self":"\[Circular\]"/);
});
