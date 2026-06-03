import test from "node:test";
import assert from "node:assert/strict";

import { AIMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { END } from "@langchain/langgraph";
import { z } from "zod";

import { toJsonValue } from "@/lib/json";
import { parsePaginationInteger } from "@/lib/pagination";
import { encodeToolResult } from "@/lib/chat/streamingHelpers";
import { reconcileDanglingToolCalls } from "@/lib/orchestrator/nodes/agent";
import { createToolNode } from "@/lib/orchestrator/nodes/tools";
import { routeAfterAgent } from "@/lib/orchestrator/nodes/reflector";
import {
  ASK_USER_TOOL_NAME,
  filterToolsForContext,
  selectToolsForAgentStep,
  shouldBypassSemanticCacheForMessageContext,
  shouldBypassSemanticCacheForToolIntent,
} from "@/lib/orchestrator/tools";
import { MessageRole, type Message } from "@/lib/schemas/chat";
import type { AgentStateType } from "@/lib/orchestrator/state";
import {
  COMPOSIO_TOOLKITS,
  notConnectedMessage,
  getEssentialComposioToolSlugs,
  isDangerousAction,
  type ComposioToolkit,
} from "@/lib/tools/composio/config";

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

function createAgentState(overrides: Partial<AgentStateType>): AgentStateType {
  return {
    messages: [],
    userId: "test-user",
    conversationId: undefined,
    connectedServices: [],
    toolApprovals: {},
    activeSubAgent: null,
    toolPlan: null,
    ...overrides,
  } as AgentStateType;
}

test("essential connector tools cover discovery and read paths across supported toolkits", () => {
  const requiredByToolkit: Record<ComposioToolkit, string[]> = {
    gmail: ["GMAIL_GET_PROFILE", "GMAIL_LIST_THREADS"],
    googlecalendar: ["GOOGLECALENDAR_LIST_CALENDARS", "GOOGLECALENDAR_EVENTS_LIST"],
    googledrive: ["GOOGLEDRIVE_FIND_FOLDER", "GOOGLEDRIVE_GET_FILE_METADATA"],
    googledocs: ["GOOGLEDOCS_SEARCH_DOCUMENTS", "GOOGLEDOCS_GET_DOCUMENT_BY_ID"],
    googlesheets: ["GOOGLESHEETS_SEARCH_SPREADSHEETS", "GOOGLESHEETS_GET_TABLE_SCHEMA", "GOOGLESHEETS_QUERY_TABLE"],
    slack: ["SLACK_LIST_CONVERSATIONS", "SLACK_FIND_CHANNELS", "SLACK_FIND_USERS", "SLACK_FETCH_TEAM_INFO"],
    notion: ["NOTION_FETCH_DATA", "NOTION_FETCH_DATABASE"],
    github: ["GITHUB_FIND_REPOSITORIES", "GITHUB_GET_A_REPOSITORY", "GITHUB_LIST_COMMITS"],
    linear: ["LINEAR_GET_CURRENT_USER", "LINEAR_LIST_LINEAR_PROJECTS"],
  };

  for (const toolkit of COMPOSIO_TOOLKITS) {
    const essentials = getEssentialComposioToolSlugs([toolkit]);
    for (const requiredTool of requiredByToolkit[toolkit]) {
      assert.ok(
        essentials.includes(requiredTool),
        `${toolkit} essentials should include ${requiredTool}`
      );
    }
  }
});

test("connector not-connected messages are generic across toolkits", () => {
  assert.equal(
    notConnectedMessage("gmail"),
    "Gmail is not connected — please enable it in the Tools menu (⚙️)."
  );
  assert.equal(
    notConnectedMessage("notion"),
    "Notion is not connected — please enable it in the Tools menu (⚙️)."
  );
  assert.equal(
    notConnectedMessage("github"),
    "GitHub is not connected — please enable it in the Tools menu (⚙️)."
  );
});


test("connector tool auth failures normalize per toolkit", async () => {
  const node = createToolNode([
    new DynamicStructuredTool({
      name: "GMAIL_LIST_THREADS",
      description: "test Gmail tool",
      schema: z.object({}),
      func: async () => {
        throw new Error("401 unauthorized");
      },
    }),
  ]);

  const result = await node(createAgentState({
    messages: [
      new AIMessage({
        content: "",
        tool_calls: [{ id: "call-1", name: "GMAIL_LIST_THREADS", args: {} }],
      }),
    ],
  }));

  assert.equal(result.messages[0].content, notConnectedMessage("gmail"));
});

test("successful connector payloads with auth-like substrings are not rewritten as disconnected", async () => {
  const successEnvelope = JSON.stringify({
    data: { login: "octocat", two_factor_authentication: true, plan: { permissions: {} } },
    error: null,
    successful: true,
  });
  const node = createToolNode([
    new DynamicStructuredTool({
      name: "GITHUB_GET_THE_AUTHENTICATED_USER",
      description: "test GitHub tool",
      schema: z.object({}),
      func: async () => successEnvelope,
    }),
  ]);

  const result = await node(createAgentState({
    messages: [
      new AIMessage({
        content: "",
        tool_calls: [{ id: "call-1", name: "GITHUB_GET_THE_AUTHENTICATED_USER", args: {} }],
      }),
    ],
  }));

  assert.equal(result.messages[0].content, successEnvelope);
  assert.notEqual(result.messages[0].content, notConnectedMessage("github"));
});

test("failed connector envelope with an auth error normalizes to a not-connected message", async () => {
  const node = createToolNode([
    new DynamicStructuredTool({
      name: "GITHUB_GET_THE_AUTHENTICATED_USER",
      description: "test GitHub tool",
      schema: z.object({}),
      func: async () =>
        JSON.stringify({
          data: {},
          error: "Could not find a connected account: no connected account found",
          successful: false,
        }),
    }),
  ]);

  const result = await node(createAgentState({
    messages: [
      new AIMessage({
        content: "",
        tool_calls: [{ id: "call-1", name: "GITHUB_GET_THE_AUTHENTICATED_USER", args: {} }],
      }),
    ],
  }));

  assert.equal(result.messages[0].content, notConnectedMessage("github"));
});

test("failed connector envelope with a non-auth error is passed through verbatim", async () => {
  const errorEnvelope = JSON.stringify({
    data: {},
    error: "Repository not found",
    successful: false,
  });
  const node = createToolNode([
    new DynamicStructuredTool({
      name: "GITHUB_GET_A_REPOSITORY",
      description: "test GitHub tool",
      schema: z.object({}),
      func: async () => errorEnvelope,
    }),
  ]);

  const result = await node(createAgentState({
    messages: [
      new AIMessage({
        content: "",
        tool_calls: [{ id: "call-1", name: "GITHUB_GET_A_REPOSITORY", args: {} }],
      }),
    ],
  }));

  assert.equal(result.messages[0].content, errorEnvelope);
});

test("agent step tool selection includes essentials of the mentioned connector", () => {
  const tools = [
    createTool(ASK_USER_TOOL_NAME),
    createTool("NOTION_FETCH_DATA"),
    createTool("NOTION_FETCH_DATABASE"),
    createTool("NOTION_QUERY_DATABASE_WITH_FILTER"),
    createTool("NOTION_QUERY_DATABASE"),
    createTool("NOTION_SEARCH_NOTION_PAGE"),
    createTool("NOTION_FETCH_ROW"),
    createTool("NOTION_RETRIEVE_PAGE"),
    createTool("GITHUB_FIND_REPOSITORIES"),
    createTool("GITHUB_CREATE_ISSUE"),
  ];

  const selected = selectToolsForAgentStep(tools, {
    latestUserText: "Inspect the Projects database schema from my Notion workspace",
    connectedServices: ["notion", "github"],
  }).map((tool) => tool.name);

  assert.ok(selected.includes(ASK_USER_TOOL_NAME));
  assert.ok(selected.includes("NOTION_FETCH_DATA"));
  assert.ok(selected.includes("NOTION_FETCH_DATABASE"));
  assert.ok(selected.includes("NOTION_QUERY_DATABASE_WITH_FILTER"));
  assert.equal(selected.includes("GITHUB_CREATE_ISSUE"), false);
});

test("agent step tool selection caps broad connector sets while keeping target essentials", () => {
  const gmailEssentials = getEssentialComposioToolSlugs(["gmail"]).map(createTool);
  const otherConnectorTools = [
    ...getEssentialComposioToolSlugs(["notion", "github", "linear"]).map(createTool),
    ...Array.from({ length: 40 }, (_, index) => createTool(`GITHUB_FAKE_TOOL_${index}`)),
  ];
  const tools = [createTool(ASK_USER_TOOL_NAME), ...gmailEssentials, ...otherConnectorTools];

  const selected = selectToolsForAgentStep(tools, {
    latestUserText: "Search my Gmail inbox and list recent email threads",
    connectedServices: ["gmail", "notion", "github", "linear"],
  }).map((tool) => tool.name);

  assert.ok(selected.length <= 18);
  assert.ok(selected.includes("GMAIL_GET_PROFILE"));
  assert.ok(selected.includes("GMAIL_LIST_THREADS"));
  assert.ok(selected.includes("GMAIL_FETCH_MESSAGE_BY_THREAD_ID"));
  assert.equal(selected.some((name) => name.startsWith("NOTION_")), false);
});

test("planned connector query tools keep prerequisite discovery tools available", () => {
  const tools = [
    createTool(ASK_USER_TOOL_NAME),
    createTool("NOTION_FETCH_DATA"),
    createTool("NOTION_FETCH_DATABASE"),
    createTool("NOTION_QUERY_DATABASE_WITH_FILTER"),
    createTool("NOTION_QUERY_DATABASE"),
    createTool("NOTION_SEARCH_NOTION_PAGE"),
    createTool("NOTION_FETCH_ROW"),
    createTool("NOTION_RETRIEVE_PAGE"),
    createTool("SLACK_SEND_MESSAGE"),
  ];

  const filtered = filterToolsForContext(
    tools,
    undefined,
    ["NOTION_QUERY_DATABASE_WITH_FILTER"]
  ).map((tool) => tool.name);

  assert.ok(filtered.includes(ASK_USER_TOOL_NAME));
  assert.ok(filtered.includes("NOTION_FETCH_DATA"));
  assert.ok(filtered.includes("NOTION_FETCH_DATABASE"));
  assert.ok(filtered.includes("NOTION_QUERY_DATABASE_WITH_FILTER"));
  assert.equal(filtered.includes("SLACK_SEND_MESSAGE"), false);
});

test("semantic cache is bypassed for connector-backed and fresh web intents", () => {
  assert.equal(
    shouldBypassSemanticCacheForToolIntent(
      "Fetch active in-progress projects from my Notion workspace",
      ["notion"]
    ),
    true
  );
  assert.equal(
    shouldBypassSemanticCacheForToolIntent("Fetch active projects from Notion", ["github"]),
    true
  );
  assert.equal(
    shouldBypassSemanticCacheForToolIntent("What is the latest OpenAI model news?", []),
    true
  );
  assert.equal(
    shouldBypassSemanticCacheForToolIntent("Explain what a binary search tree is", []),
    false
  );
});

test("semantic cache is bypassed when the request context includes images", () => {
  const messages: Message[] = [{
    role: MessageRole.USER,
    content: [
      { type: "text", text: "Build an artifact using the attached image" },
      { type: "image_url", image_url: { url: "https://utfs.io/f/artifact-image.png" } },
    ],
  }];

  assert.equal(
    shouldBypassSemanticCacheForMessageContext(
      messages,
      "Build an artifact using the attached image",
      []
    ),
    true
  );
});

test("tool routing limits execution rounds, not parallel tool result count", () => {
  const firstRoundCallId = "call-first";
  const messages = [
    new HumanMessage("do something"),
    createToolCallingMessage(firstRoundCallId),
    ...Array.from({ length: 20 }, (_, index) =>
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
  const messages = [
    new HumanMessage("do something"),
    ...Array.from({ length: 15 }, (_, index) =>
      createToolCallingMessage(`call-${index}`)
    ),
    createToolCallingMessage("call-final"),
  ];

  assert.equal(routeAfterAgent({ messages } as AgentStateType), END);
});

test("tool routing ignores tool calls from prior turns (before last HumanMessage)", () => {
  // Simulate checkpointed history: prior turn had many tool calls
  const priorTurnMessages = Array.from({ length: 10 }, (_, index) =>
    createToolCallingMessage(`old-call-${index}`)
  );
  const messages = [
    new HumanMessage("old question"),
    ...priorTurnMessages,
    new HumanMessage("new question"),
    createToolCallingMessage("new-call-1"),
  ];

  // Only 1 tool round in current turn — should continue
  assert.equal(routeAfterAgent({ messages } as AgentStateType), "tools");
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

test("reconcile strips dangling tool_calls from the AI message", () => {
  const messages = [
    new HumanMessage("do it"),
    new AIMessage({ content: "", tool_calls: [{ id: "call_x", name: "test_tool", args: {} }] }),
  ];

  const reconciled = reconcileDanglingToolCalls(messages);

  assert.equal(reconciled.length, 2);
  const aiMsg = reconciled[1] as AIMessage;
  assert.equal((aiMsg.tool_calls ?? []).length, 0);
});

test("reconcile strips metadata-only function_call items from response_metadata.output without synthesizing", () => {
  const ai = new AIMessage({ content: "" });
  ai.response_metadata = {
    output: [
      { type: "reasoning", id: "rs_1", summary: [] },
      { type: "function_call", call_id: "call_meta", name: "test_tool", arguments: "{}" },
    ],
  };
  const reconciled = reconcileDanglingToolCalls([new HumanMessage("hi"), ai]);

  const synthesized = reconciled.find(
    (m): m is ToolMessage => m instanceof ToolMessage && m.tool_call_id === "call_meta"
  );
  assert.ok(!synthesized, "should NOT synthesize a ToolMessage for metadata-only function_call");
  const sanitizedAi = reconciled.find((m) => m instanceof AIMessage) as AIMessage;
  const output = sanitizedAi.response_metadata?.output as Array<{ type: string }> | undefined;
  assert.ok(!output || !output.find((i) => (i as { call_id?: string }).call_id === "call_meta"), "function_call should be stripped from metadata");
});

test("reconcile leaves already-satisfied tool calls untouched", () => {
  const messages = [
    new AIMessage({ content: "", tool_calls: [{ id: "call_ok", name: "test_tool", args: {} }] }),
    new ToolMessage({ content: "result", tool_call_id: "call_ok" }),
  ];

  const reconciled = reconcileDanglingToolCalls(messages);

  assert.equal(reconciled.length, 2);
  assert.equal(reconciled.filter((m) => m instanceof ToolMessage).length, 1);
});

test("reconcile strips dangling tool_calls and preserves other messages", () => {
  const messages = [
    new AIMessage({ content: "", tool_calls: [{ id: "call_a", name: "test_tool", args: {} }] }),
    new HumanMessage("follow up"),
  ];

  const reconciled = reconcileDanglingToolCalls(messages);

  assert.equal(reconciled.length, 2);
  const aiMsg = reconciled[0] as AIMessage;
  assert.equal((aiMsg.tool_calls ?? []).length, 0);
  assert.ok(reconciled[1] instanceof HumanMessage);
});

test("reconcile strips dangling invalid_tool_calls", () => {
  const ai = new AIMessage({ content: "" });
  (ai as unknown as { invalid_tool_calls: Array<{ id: string; name: string; args: string; type: string }> }).invalid_tool_calls = [
    { id: "call_invalid_1", name: "broken_tool", args: "{bad json", type: "invalid_tool_call" },
  ];

  const reconciled = reconcileDanglingToolCalls([new HumanMessage("hi"), ai]);

  const synthesized = reconciled.find(
    (m): m is ToolMessage => m instanceof ToolMessage && m.tool_call_id === "call_invalid_1"
  );
  assert.ok(!synthesized, "should NOT synthesize a ToolMessage for dangling invalid_tool_call");
  const sanitizedAi = reconciled.find((m) => m instanceof AIMessage) as AIMessage;
  assert.equal((sanitizedAi as unknown as { invalid_tool_calls?: unknown[] }).invalid_tool_calls?.length ?? 0, 0);
});

test("reconcile strips dangling additional_kwargs.tool_calls without synthesizing", () => {
  const ai = new AIMessage({ content: "" });
  ai.additional_kwargs = {
    tool_calls: [
      { id: "call_kwargs_1", type: "function", function: { name: "some_tool", arguments: "{}" } },
    ],
  };

  const reconciled = reconcileDanglingToolCalls([new HumanMessage("hi"), ai]);

  const synthesized = reconciled.find(
    (m): m is ToolMessage => m instanceof ToolMessage && m.tool_call_id === "call_kwargs_1"
  );
  assert.ok(!synthesized, "should NOT synthesize a ToolMessage for additional_kwargs-only tool_call");
  const sanitizedAi = reconciled.find((m) => m instanceof AIMessage) as AIMessage;
  assert.ok(!sanitizedAi.additional_kwargs?.tool_calls || (sanitizedAi.additional_kwargs.tool_calls as unknown[]).length === 0, "tool_calls should be stripped from additional_kwargs");
});

test("reconcile strips dangling function_call items from response_metadata.output", () => {
  const ai = new AIMessage({ content: "" });
  ai.response_metadata = {
    output: [
      { type: "reasoning", id: "rs_1", summary: [] },
      { type: "function_call", call_id: "call_satisfied", name: "tool_a", arguments: "{}" },
      { type: "function_call", call_id: "call_dangling", name: "tool_b", arguments: "{}" },
    ],
  };

  const messages = [
    new HumanMessage("hi"),
    ai,
    new ToolMessage({ content: "ok", tool_call_id: "call_satisfied" }),
  ];

  const reconciled = reconcileDanglingToolCalls(messages);
  const sanitizedAi = reconciled.find((m) => m instanceof AIMessage) as AIMessage;
  const output = sanitizedAi.response_metadata?.output as Array<{ type: string; call_id?: string }>;

  assert.equal(output.length, 2, "reasoning + satisfied function_call should remain");
  assert.ok(output.find((i) => i.type === "reasoning"), "reasoning should be preserved");
  assert.ok(
    output.find((i) => i.type === "function_call" && i.call_id === "call_satisfied"),
    "satisfied function_call should be preserved",
  );
  assert.ok(
    !output.find((i) => i.type === "function_call" && i.call_id === "call_dangling"),
    "dangling function_call should be stripped",
  );

  const synthesized = reconciled.find(
    (m): m is ToolMessage => m instanceof ToolMessage && m.tool_call_id === "call_dangling",
  );
  assert.ok(!synthesized, "should NOT synthesize output for metadata-only dangling call");
});
