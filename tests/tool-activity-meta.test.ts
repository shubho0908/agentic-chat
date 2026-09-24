import test from "node:test";
import assert from "node:assert/strict";

import { ToolStatus, type ToolActivity, type ToolArgs } from "@/lib/schemas/chat";
import { ToolName } from "@/lib/tools/constants";
import {
  formatToolArgsPreview,
  formatToolResultPreview,
  getToolActionLabel,
  getToolFamily,
  getToolKeyArg,
  getToolResultMeta,
  getToolRowLabel,
  getToolSources,
  NestedToolName,
  groupToolActivities,
  parseToolSources,
  summarizeToolRun,
  truncateToolPreview,
} from "@/components/chat/aiThinkingAnimation/toolActivityMeta";

function activity(
  toolName: string,
  partial: Partial<Omit<ToolActivity, "toolName">> = {},
): ToolActivity {
  return {
    toolCallId: partial.toolCallId ?? `${toolName}-1`,
    toolName,
    status: partial.status ?? ToolStatus.Completed,
    args: (partial.args ?? {}) as ToolArgs,
    result: partial.result,
    error: partial.error,
    timestamp: partial.timestamp ?? 0,
  };
}

test("derives action labels from slugs instead of a hardcoded table", () => {
  assert.equal(getToolActionLabel("GMAIL_FETCH_MESSAGE_BY_THREAD_ID"), "Fetch message by thread id");
  assert.equal(getToolActionLabel("SLACK_SEND_MESSAGE"), "Send message");
  assert.equal(getToolActionLabel(ToolName.WEB_SEARCH), "Web search");
  assert.equal(getToolActionLabel("standalone"), "standalone");
});

test("maps connector prefixes to families, longest prefix first", () => {
  assert.equal(getToolFamily("GMAIL_LIST_THREADS").label, "Gmail");
  assert.equal(getToolFamily("GOOGLEDOCS_GET_DOCUMENT_BY_ID").label, "Docs");
  assert.equal(getToolFamily("GOOGLESHEETS_APPEND_ROW").icon, "sheets");
  assert.equal(getToolFamily("HUBSPOT_CREATE_CONTACT").label, "Create contact");
  assert.equal(getToolRowLabel("GMAIL_SEND_EMAIL"), "Gmail · Send email");
  assert.equal(getToolRowLabel("HUBSPOT_CREATE_CONTACT"), "Create contact");
  // Built-in tools must not read "Read webpage · Read webpage".
  assert.equal(getToolRowLabel(ToolName.WEB_SCRAPE), "Read webpage");
  assert.equal(getToolRowLabel(ToolName.WEB_SEARCH), "Web search");
  assert.equal(getToolRowLabel(ToolName.DEEP_RESEARCH), "Research Agent");
});
test("maps nested activity types to distinct icons", () => {
  assert.equal(getToolFamily(NestedToolName.THOUGHT).icon, "thought");
  assert.equal(getToolFamily(NestedToolName.COMMAND).icon, "terminal");
  assert.equal(getToolFamily(ToolName.WEB_SEARCH).icon, "search");
  assert.equal(getToolFamily(NestedToolName.FETCH).icon, "fetch");
});

test("prefers human-readable args and falls back to identifiers", () => {
  assert.deepEqual(getToolKeyArg(activity("GMAIL_LIST_THREADS", { args: { query: "newer_than:1d" } })), {
    text: "newer_than:1d",
    isIdentifier: false,
  });

  assert.deepEqual(
    getToolKeyArg(
      activity("GMAIL_FETCH_MESSAGE_BY_THREAD_ID", { args: { thread_id: "19f4a2c8d1e3b7f9" } }),
    ),
    { text: "19f4a2c8d1e3b7f9", isIdentifier: true },
  );

  assert.equal(getToolKeyArg(activity("GMAIL_LIST_THREADS", { args: { max_results: 25 } })), null);
  assert.equal(getToolKeyArg(activity("GMAIL_LIST_THREADS", { args: { query: "   " } })), null);
});

test("unwraps JSON-encoded Composio args and URL args", () => {
  const scrape = activity(ToolName.WEB_SCRAPE, {
    args: { input: JSON.stringify({ url: "https://www.theinformation.com/articles/agentic-email-triage" }) },
  });
  assert.deepEqual(getToolKeyArg(scrape), {
    text: "theinformation.com",
    href: "https://www.theinformation.com/articles/agentic-email-triage",
    isIdentifier: false,
  });
});

test("collapses whitespace and clamps long arg values", () => {
  const arg = getToolKeyArg(activity("WEB_SEARCH", { args: { query: "  spaced\n query  " } }));
  assert.equal(arg?.text, "spaced query");

  const long = getToolKeyArg(activity("WEB_SEARCH", { args: { query: "x".repeat(400) } }));
  assert.equal(Array.from(long?.text ?? "").length, 121);
  assert.ok(long?.text.endsWith("…"));
});

test("reports result metadata only when it carries signal", () => {
  // Plain successes rely on the row's check icon instead of a "Done" label.
  assert.equal(getToolResultMeta(activity("GMAIL_LIST_THREADS", { result: "Fetched 8 threads successfully" })), null);
  assert.equal(getToolResultMeta(activity("GMAIL_LIST_THREADS", { result: { successful: true } })), null);
  assert.deepEqual(
    getToolResultMeta(activity("GMAIL_FETCH_MESSAGE_BY_THREAD_ID", { result: "Message not found in thread" })),
    { label: "Not found", tone: "warning" },
  );
  assert.deepEqual(
    getToolResultMeta(activity("GMAIL_LIST_THREADS", { result: "No threads found in this mailbox" })),
    { label: "Not found", tone: "warning" },
  );
  // The old heuristic mapped any string containing "No " to "Not found".
  assert.equal(getToolResultMeta(activity("GMAIL_LIST_THREADS", { result: "Nothing else to report" })), null);
  assert.deepEqual(
    getToolResultMeta(activity("GMAIL_LIST_THREADS", { result: { error: "invalid_grant" } })),
    { label: "Error", tone: "error" },
  );
  assert.deepEqual(
    getToolResultMeta(activity(ToolName.WEB_SCRAPE, { result: "x".repeat(4200) })),
    { label: "4.2k chars", tone: "neutral" },
  );
  assert.deepEqual(
    getToolResultMeta(activity(ToolName.WEB_SCRAPE, { result: "x".repeat(320) })),
    { label: "320 chars", tone: "neutral" },
  );
  assert.deepEqual(
    getToolResultMeta(activity(ToolName.WEB_SCRAPE, { result: "Failed to extract page content" })),
    { label: "Failed", tone: "error" },
  );
  assert.equal(getToolResultMeta(activity("GMAIL_LIST_THREADS", { status: ToolStatus.Calling })), null);
});

test("parses and de-duplicates web search sources", () => {
  const result =
    "URL: https://www.theinformation.com/a\nURL: https://blog.google/b\nURL: https://www.theinformation.com/a";
  assert.deepEqual(parseToolSources(result), [
    { domain: "theinformation.com", url: "https://www.theinformation.com/a" },
    { domain: "blog.google", url: "https://blog.google/b" },
  ]);
  assert.deepEqual(getToolSources(activity("GMAIL_LIST_THREADS", { result })), []);
  assert.deepEqual(
    getToolSources(activity(ToolName.WEB_SEARCH, { status: ToolStatus.Calling, result })),
    [],
  );
});

test("groups consecutive calls of the same family and counts statuses", () => {
  const activities = [
    activity("GMAIL_LIST_THREADS", { toolCallId: "a" }),
    activity("GMAIL_FETCH_MESSAGE_BY_THREAD_ID", { toolCallId: "b" }),
    activity(ToolName.WEB_SEARCH, { toolCallId: "c" }),
    activity(ToolName.WEB_SEARCH, { toolCallId: "d", result: "URL: https://a.com\nURL: https://b.com" }),
  ];

  const groups = groupToolActivities(activities);
  assert.deepEqual(groups.map((group) => group.label), ["Gmail", "Web search"]);
  assert.equal(groups[0].activities.length, 2);

  const summary = summarizeToolRun(activities);
  assert.equal(summary.total, 4);
  assert.equal(summary.completed, 4);
  assert.equal(summary.failed, 0);
  assert.equal(summary.running, 0);
  assert.equal(summary.title, "Gmail + Web search");
  assert.equal(summary.countLabel, "4 tool calls");
  assert.equal(summary.sourceCount, 2);
  assert.equal(summary.hasFailures, false);
  assert.equal(summary.progressLabel, null);
});

test("summarizes a live run with progress and the in-flight action", () => {
  const summary = summarizeToolRun([
    activity("GMAIL_LIST_THREADS", { toolCallId: "a" }),
    activity("GMAIL_FETCH_MESSAGE_BY_THREAD_ID", { toolCallId: "b", status: ToolStatus.Calling }),
    activity("GMAIL_FETCH_MESSAGE_BY_THREAD_ID", { toolCallId: "c", status: ToolStatus.Error, error: "boom" }),
  ]);

  assert.equal(summary.running, 1);
  assert.equal(summary.failed, 1);
  assert.equal(summary.title, "Gmail");
  assert.equal(summary.icon, "gmail");
  assert.equal(summary.activeLabel, "Fetch message by thread id");
  assert.equal(summary.progressLabel, "2/3");
  assert.equal(summary.hasFailures, true);
});

test("summarizes an empty run without inventing a toolkit", () => {
  const summary = summarizeToolRun([]);
  assert.equal(summary.title, "Tools");
  assert.equal(summary.countLabel, "0 tool calls");
  assert.equal(summary.groups.length, 0);
});

test("truncates previews by code point and flags the cut", () => {
  assert.deepEqual(truncateToolPreview("short", 10), { text: "short", truncated: false });
  assert.deepEqual(truncateToolPreview("0123456789ab", 10), { text: "0123456789\n…", truncated: true });
});

test("formats args and result previews", () => {
  assert.equal(formatToolArgsPreview({}), null);
  assert.deepEqual(formatToolArgsPreview({ thread_id: "19f4a2c8d1e3b7f9" }), {
    text: '{\n  "thread_id": "19f4a2c8d1e3b7f9"\n}',
    truncated: false,
  });

  const args = formatToolArgsPreview({ input: JSON.stringify({ query: "hi" }) });
  assert.equal(args?.text, '{\n  "query": "hi"\n}');

  assert.deepEqual(formatToolResultPreview({ error: "rate limit exceeded" }), {
    text: "rate limit exceeded",
    truncated: false,
  });
  assert.equal(formatToolResultPreview({}), null);
  assert.equal(formatToolResultPreview({ result: null }), null);
  assert.deepEqual(formatToolResultPreview({ result: { successful: true } }), {
    text: '{\n  "successful": true\n}',
    truncated: false,
  });
});

