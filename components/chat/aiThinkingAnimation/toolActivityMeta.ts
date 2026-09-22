import { ToolStatus, type JsonValue, type ToolActivity, type ToolArgs } from "@/lib/schemas/chat";
import { ToolName } from "@/lib/tools/constants";

/** Icon identity only — the React component mapping lives in the row layer so
 *  every derivation in this module stays pure and unit-testable. */
export type ToolIconKey =
  | "search"
  | "globe"
  | "research"
  | "thought"
  | "terminal"
  | "fetch"
  | "gmail"
  | "calendar"
  | "drive"
  | "docs"
  | "sheets"
  | "slides"
  | "slack"
  | "notion"
  | "github"
  | "linear"
  | "tool";

interface ToolFamily {
  key: string;
  label: string;
  icon: ToolIconKey;
}

export const NestedToolName = {
  THOUGHT: "thought_process",
  COMMAND: "run_command",
  FETCH: "fetch",
} as const;

const BUILT_IN_FAMILIES: Record<string, ToolFamily> = {
  [NestedToolName.THOUGHT]: { key: NestedToolName.THOUGHT, label: "Thought process", icon: "thought" },
  [NestedToolName.COMMAND]: { key: NestedToolName.COMMAND, label: "Run", icon: "terminal" },
  [NestedToolName.FETCH]: { key: NestedToolName.FETCH, label: "Fetch", icon: "fetch" },
  [ToolName.WEB_SEARCH]: { key: ToolName.WEB_SEARCH, label: "Web search", icon: "search" },
  [ToolName.WEB_SCRAPE]: { key: ToolName.WEB_SCRAPE, label: "Read webpage", icon: "globe" },
  [ToolName.WEB_CRAWL]: { key: ToolName.WEB_CRAWL, label: "Crawl site", icon: "globe" },
  [ToolName.DEEP_RESEARCH]: { key: ToolName.DEEP_RESEARCH, label: "Research Agent", icon: "research" },
};

/** Connector toolkit prefixes. Sorted longest-first so a future `GOOGLE*`
 *  toolkit can never shadow `GMAIL` / `GOOGLEDOCS` style slugs. */
const CONNECTOR_FAMILY_LIST: ReadonlyArray<{ prefix: string; label: string; icon: ToolIconKey }> = [
  { prefix: "GOOGLECALENDAR", label: "Calendar", icon: "calendar" },
  { prefix: "GOOGLESHEETS", label: "Sheets", icon: "sheets" },
  { prefix: "GOOGLESLIDES", label: "Slides", icon: "slides" },
  { prefix: "GOOGLEDOCS", label: "Docs", icon: "docs" },
  { prefix: "GOOGLEDRIVE", label: "Drive", icon: "drive" },
  { prefix: "GMAIL", label: "Gmail", icon: "gmail" },
  { prefix: "SLACK", label: "Slack", icon: "slack" },
  { prefix: "NOTION", label: "Notion", icon: "notion" },
  { prefix: "GITHUB", label: "GitHub", icon: "github" },
  { prefix: "LINEAR", label: "Linear", icon: "linear" },
];

const CONNECTOR_FAMILIES = CONNECTOR_FAMILY_LIST.slice().sort(
  (a, b) => b.prefix.length - a.prefix.length,
);

const SEARCH_TOOL_NAMES: ReadonlySet<string> = new Set([
  ToolName.WEB_SEARCH,
  ToolName.DEEP_RESEARCH,
]);

/** Human-readable action derived from the slug itself, so labels stay correct
 *  even when Composio renames or adds slugs (e.g. `GMAIL_FETCH_EMAILS` →
 *  "Fetch emails"). */
export function getToolActionLabel(toolName: string): string {
  const builtIn = BUILT_IN_FAMILIES[toolName];
  if (builtIn) return builtIn.label;

  const parts = toolName.split("_");
  if (parts.length > 1) {
    const action = parts.slice(1).join(" ").toLowerCase();
    return action.charAt(0).toUpperCase() + action.slice(1);
  }

  return toolName.replace(/_/g, " ");
}

export function getToolFamily(toolName: string): ToolFamily {
  const builtIn = BUILT_IN_FAMILIES[toolName];
  if (builtIn) return builtIn;

  const upper = toolName.toUpperCase();
  const connector = CONNECTOR_FAMILIES.find((candidate) => upper.startsWith(candidate.prefix));
  if (connector) return { key: connector.prefix, label: connector.label, icon: connector.icon };

  const action = getToolActionLabel(toolName);
  return { key: `action:${action}`, label: action, icon: "tool" };
}

/** "Gmail · Fetch message by thread id" — the service prefix is dropped when
 *  the toolkit is unknown, because then the action already is the whole label. */
export function getToolRowLabel(toolName: string): string {
  const family = getToolFamily(toolName);
  const action = getToolActionLabel(toolName);
  return family.label === action ? action : `${family.label} · ${action}`;
}

const KEY_ARG_MAX_LENGTH = 120;

interface ToolKeyArg {
  text: string;
  href?: string;
  /** Opaque ids render in mono so they read as identifiers, not prose. */
  isIdentifier: boolean;
}

/** Ordered by how much they tell a human: intent first, ids last. */
const USER_FACING_ARG_FIELDS = [
  "query",
  "command",
  "subject",
  "title",
  "name",
  "q",
  "to",
  "channel",
  "url",
  "path",
  "text",
];

/** Ids keep a run of identical tool calls distinguishable ("which thread?"). */
const IDENTIFIER_ARG_FIELDS = [
  "thread_id",
  "threadId",
  "message_id",
  "messageId",
  "email_id",
  "document_id",
  "documentId",
  "file_id",
  "fileId",
  "folder_id",
  "spreadsheet_id",
  "channel_id",
  "page_id",
  "board_id",
  "id",
];

function parseToolArgs(args: ToolArgs): ToolArgs {
  const input = (args as Record<string, unknown>).input;
  if (typeof input !== "string") return args;

  try {
    const parsed = JSON.parse(input);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as ToolArgs;
  } catch {
    // Composio streams partial JSON into `input`; fall back to the raw args.
  }
  return args;
}

function readArgText(args: ToolArgs, field: string): string | null {
  const value = (args as Record<string, unknown>)[field];
  const raw = Array.isArray(value)
    ? value.filter((item) => typeof item !== "object").join(", ")
    : value;

  if (typeof raw === "number" || typeof raw === "boolean") return String(raw);
  if (typeof raw !== "string") return null;

  const collapsed = raw.replace(/\s+/g, " ").trim();
  return collapsed.length > 0 ? collapsed : null;
}

function clamp(value: string, maxLength: number): string {
  const characters = Array.from(value);
  if (characters.length <= maxLength) return value;
  return `${characters.slice(0, maxLength).join("").trimEnd()}…`;
}

function toKeyArg(value: string, isIdentifier: boolean): ToolKeyArg {
  const text = clamp(value, KEY_ARG_MAX_LENGTH);
  if (/^https?:\/\//i.test(value)) {
    try {
      return { text: new URL(value).hostname.replace(/^www\./, ""), href: value, isIdentifier: false };
    } catch {
      return { text, isIdentifier: false };
    }
  }
  return { text, isIdentifier };
}

export function getToolKeyArg(activity: ToolActivity): ToolKeyArg | null {
  const args = parseToolArgs(activity.args);

  for (const field of USER_FACING_ARG_FIELDS) {
    const value = readArgText(args, field);
    if (value) return toKeyArg(value, false);
  }

  for (const field of IDENTIFIER_ARG_FIELDS) {
    const value = readArgText(args, field);
    if (value) return toKeyArg(value, true);
  }

  return null;
}

export type ToolMetaTone = "neutral" | "warning" | "error";

interface ToolResultMeta {
  label: string;
  tone: ToolMetaTone;
}

interface ToolSource {
  domain: string;
  url: string;
}

function isSearchTool(toolName: string): boolean {
  return SEARCH_TOOL_NAMES.has(toolName);
}

function extractToolResultText(result: JsonValue): string | null {
  if (typeof result === "string") return result;
  if (result && typeof result === "object" && !Array.isArray(result)) {
    const obj = result as Record<string, JsonValue>;
    if (obj.kwargs && typeof obj.kwargs === "object" && !Array.isArray(obj.kwargs)) {
      const kwargs = obj.kwargs as Record<string, JsonValue>;
      if (typeof kwargs.content === "string") return kwargs.content;
    }
    if (typeof obj.content === "string") return obj.content;
  }
  return null;
}

const NO_RESULT_PATTERN =
  /\bnot found\b|\bno\s+(?:results?|matches?|messages?|threads?|events?|files?|documents?|items?|records?)\b/i;

/** Parses the `URL: …` shapes emitted by the web-search tools. */
export function parseToolSources(result: JsonValue): ToolSource[] {
  const content = extractToolResultText(result);
  if (!content) return [];

  const matches = content.match(/(?:URL:\s+|^|\n)(https?:\/\/[^\s)\]"'<>]+)/gm);
  if (!matches) return [];

  const sources: ToolSource[] = [];
  const seen = new Set<string>();

  for (const match of matches) {
    const urlMatch = match.match(/https?:\/\/[^\s)\]"'<>]+/);
    if (!urlMatch) continue;

    const url = urlMatch[0].replace(/[.,;]+$/, "");
    if (seen.has(url)) continue;

    seen.add(url);
    try {
      sources.push({ domain: new URL(url).hostname.replace(/^www\./, ""), url });
    } catch {
      // Ignore malformed URLs instead of dropping the whole run.
    }
  }

  return sources;
}

export function getToolSources(activity: ToolActivity): ToolSource[] {
  if (!isSearchTool(activity.toolName) || activity.status !== ToolStatus.Completed || !activity.result) {
    return [];
  }
  return parseToolSources(activity.result);
}

export function getToolResultMeta(activity: ToolActivity): ToolResultMeta | null {
  const { toolName, result, status } = activity;
  if (status !== ToolStatus.Completed || !result) return null;

  if (isSearchTool(toolName)) {
    const sources = parseToolSources(result);
    if (sources.length > 0) return { label: `${sources.length} sources`, tone: "neutral" };
    const content = extractToolResultText(result);
    if (content && content.includes("No results")) return { label: "No results", tone: "warning" };
    return null;
  }

  if (toolName === ToolName.WEB_SCRAPE || toolName === ToolName.WEB_CRAWL) {
    const content = extractToolResultText(result);
    if (!content) return null;
    if (content.includes("Failed to extract")) return { label: "Failed", tone: "error" };
    if (content.length === 0) return null;
    const characters = content.length;
    return {
      label: characters < 1000 ? `${characters} chars` : `${Math.round(characters / 100) / 10}k chars`,
      tone: "neutral",
    };
  }

  if (typeof result === "string") {
    if (NO_RESULT_PATTERN.test(result)) return { label: "Not found", tone: "warning" };
  }

  if (result && typeof result === "object" && !Array.isArray(result)) {
    const obj = result as Record<string, JsonValue>;
    if (obj.error) return { label: "Error", tone: "error" };
  }

  // Bland successes deliberately carry no label: the row's check icon already
  // says "completed", and repeating "Done" 20 times is exactly the noise this
  // view exists to remove.
  return null;
}

export interface ToolPreview {
  text: string;
  truncated: boolean;
}

export function truncateToolPreview(text: string, maxLength: number): ToolPreview {
  const characters = Array.from(text);
  if (characters.length <= maxLength) return { text, truncated: false };
  return { text: `${characters.slice(0, maxLength).join("").trimEnd()}\n…`, truncated: true };
}

const ARGS_PREVIEW_MAX_LENGTH = 600;
const RESULT_PREVIEW_MAX_LENGTH = 1200;

export function formatToolArgsPreview(args: ToolArgs): ToolPreview | null {
  const parsed = parseToolArgs(args);
  if (Object.keys(parsed).length === 0) return null;

  try {
    return truncateToolPreview(JSON.stringify(parsed, null, 2), ARGS_PREVIEW_MAX_LENGTH);
  } catch {
    return null;
  }
}

export function formatToolResultPreview(
  activity: Pick<ToolActivity, "result" | "error">,
): ToolPreview | null {
  if (activity.error) return truncateToolPreview(activity.error, RESULT_PREVIEW_MAX_LENGTH);
  if (activity.result === undefined || activity.result === null) return null;

  const text = extractToolResultText(activity.result);
  if (text) return truncateToolPreview(text, RESULT_PREVIEW_MAX_LENGTH);

  try {
    return truncateToolPreview(JSON.stringify(activity.result, null, 2), RESULT_PREVIEW_MAX_LENGTH);
  } catch {
    return truncateToolPreview(String(activity.result), RESULT_PREVIEW_MAX_LENGTH);
  }
}

interface ToolRunGroup {
  key: string;
  label: string;
  icon: ToolIconKey;
  activities: ToolActivity[];
}

export interface ToolRunSummary {
  groups: ToolRunGroup[];
  total: number;
  completed: number;
  failed: number;
  running: number;
  title: string;
  icon: ToolIconKey;
  countLabel: string;
  /** In-flight action, so a collapsed header still narrates progress. */
  activeLabel: string | null;
  progressLabel: string | null;
  sourceCount: number;
  hasFailures: boolean;
}

/** Groups consecutive calls of the same toolkit while preserving run order. */
export function groupToolActivities(activities: ToolActivity[]): ToolRunGroup[] {
  const groups: ToolRunGroup[] = [];

  for (const activity of activities) {
    const family = getToolFamily(activity.toolName);
    const current = groups.at(-1);

    if (current && current.key === family.key) {
      current.activities.push(activity);
      continue;
    }

    groups.push({
      key: family.key,
      label: family.label,
      icon: family.icon,
      activities: [activity],
    });
  }

  return groups;
}

export function summarizeToolRun(activities: ToolActivity[]): ToolRunSummary {
  const groups = groupToolActivities(activities);

  let completed = 0;
  let failed = 0;
  let running = 0;
  let sourceCount = 0;
  let activeLabel: string | null = null;

  for (const activity of activities) {
    if (activity.status === ToolStatus.Calling) {
      running += 1;
      activeLabel = getToolActionLabel(activity.toolName);
    } else if (activity.status === ToolStatus.Error) {
      failed += 1;
    } else {
      completed += 1;
    }
    sourceCount += getToolSources(activity).length;
  }

  const labels = groups.map((group) => group.label);
  const [first, second] = labels;
  const title = labels.length === 0
    ? "Tools"
    : labels.length === 1
      ? first
      : labels.length === 2
        ? `${first} + ${second}`
        : `${first} + ${second} +${labels.length - 2}`;

  const total = activities.length;

  return {
    groups,
    total,
    completed,
    failed,
    running,
    title,
    icon: groups.length === 1 ? groups[0].icon : "tool",
    countLabel: total === 1 ? "1 tool call" : `${total} tool calls`,
    activeLabel,
    progressLabel: running > 0 ? `${completed + failed}/${total}` : null,
    sourceCount,
    hasFailures: failed > 0,
  };
}
