/** Structured tool-failure taxonomy for the orchestrator.
 *
 * Free-text tool errors force the agent to parse prose. This module gives
 * every failure a closed kind, a retry verdict, and a one-line hint, so the
 * agent gets context it can act on and the router gets signals it can count.
 * All functions are pure and dependency-free for cheap testing. */

export const ToolFailureKind = {
  TRANSIENT: "transient",
  AUTH: "auth",
  DENIED: "denied",
  INVALID_ARGS: "invalid_args",
  UNKNOWN: "unknown",
} as const;
export type ToolFailureKindValue =
  (typeof ToolFailureKind)[keyof typeof ToolFailureKind];

const AUTH_PATTERN =
  /(?:not connected|no connected account|connection not found|no account connected|invalid auth|authentication failed|unauthori[sz]ed|\b401\b|token_expired|refresh_failed|expired_token|invalid_token|token has expired|connection_expired|reauth|re-authenticate|session expired|oauth token)/i;

const DENIAL_PATTERN = /(?:denied|rejected) by user/i;

const TRANSIENT_PATTERN =
  /(?:timed? ?out|timed out|socket hang up|econnreset|econnrefused|temporarily unavailable|too many requests|rate limit|\b50[234]\b|did not return a result)/i;

const INVALID_ARGS_PATTERN =
  /(?:invalid (?:argument|parameter|args)|validation (?:failed|error)|required (?:field|parameter|argument)|unexpected argument|schema)/i;

const ERROR_MARKER_PATTERN =
  /(?:tool execution failed|tool execution did not return a result)/i;

const HINTS: Record<ToolFailureKindValue, string> = {
  [ToolFailureKind.TRANSIENT]: "Retry once with the same call.",
  [ToolFailureKind.AUTH]:
    "Do not retry. Tell the user which account to reconnect.",
  [ToolFailureKind.DENIED]:
    "Do not retry. The user refused; proceed without it.",
  [ToolFailureKind.INVALID_ARGS]:
    "Fix the flagged arguments, then retry once.",
  [ToolFailureKind.UNKNOWN]:
    "Retry once. If it fails again, try a different call.",
};

/** Stable id for matching a tool result to its call. Mirrors the tool
 * node's fallback so both sides agree without sharing code paths. */
export function toolCallResultId(
  toolCall: { id?: unknown; name?: unknown },
  index: number,
): string {
  return typeof toolCall.id === "string" && toolCall.id.trim()
    ? toolCall.id
    : `${toolCall.name || "tool"}-${index}`;
}

/** Deterministic signature for spotting identical repeat calls. Key order
 * is normalized; unhashable args merge into one bucket so a pathological
 * call still trips the repeat guard instead of looping forever. */
export function toolCallSignature(name: unknown, args: unknown): string {
  return `${typeof name === "string" && name ? name : "tool"}|${stableStringify(args)}`;
}

function stableStringify(value: unknown): string {
  try {
    return JSON.stringify(sortKeys(value)) ?? "null";
  } catch {
    return typeof value;
  }
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, sortKeys((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

/** Classifies a tool result. Returns null when the result is not a failure.
 * Auth and denial text always counts as failure; no success result carries
 * it. Unknown errors default to retry-once; nothing unknown is ever terminal. */
export function classifyToolFailure(
  content: unknown,
  status?: unknown,
): ToolFailureKindValue | null {
  const text = typeof content === "string" ? content : "";
  const isError =
    status === "error" ||
    ERROR_MARKER_PATTERN.test(text) ||
    AUTH_PATTERN.test(text) ||
    DENIAL_PATTERN.test(text);
  if (!isError) return null;
  if (DENIAL_PATTERN.test(text)) return ToolFailureKind.DENIED;
  if (AUTH_PATTERN.test(text)) return ToolFailureKind.AUTH;
  if (TRANSIENT_PATTERN.test(text)) return ToolFailureKind.TRANSIENT;
  if (INVALID_ARGS_PATTERN.test(text)) return ToolFailureKind.INVALID_ARGS;
  return ToolFailureKind.UNKNOWN;
}

/** True for error and denial results. Ask-user skips and successes are
 * never negative, so waiting on the user never counts as failing. */
export function isNegativeToolResult(message: {
  content: unknown;
  status?: unknown;
}): boolean {
  if (message.status === "error") return true;
  if (typeof message.content !== "string") return false;
  if (/skipped while waiting/i.test(message.content)) return false;
  return (
    ERROR_MARKER_PATTERN.test(message.content) ||
    DENIAL_PATTERN.test(message.content)
  );
}

/** Wraps the original message with a machine-readable header and a static
 * hint. The original text is preserved verbatim so no agent signal is lost. */
export function formatFailureMessage(
  kind: ToolFailureKindValue,
  original: string,
): string {
  const retryable =
    kind === ToolFailureKind.TRANSIENT || kind === ToolFailureKind.UNKNOWN;
  return `[tool-failure:${kind}|${retryable ? "retryable" : "terminal"}]\n${original}\nHint: ${HINTS[kind]}`;
}

/** Shared auth pattern. Single home so the tool node and the classifier
 * can never disagree on what counts as an auth failure. */
export function isAuthFailureText(content: string): boolean {
  return AUTH_PATTERN.test(content);
}

export const MAX_IDENTICAL_FAILURE_ROUNDS = 3;
export const MAX_CONSECUTIVE_ERROR_ROUNDS = 3;

export interface ToolCallLike {
  id?: unknown;
  name?: unknown;
  args?: unknown;
}

export interface MessageLike {
  type: string;
  tool_calls?: ToolCallLike[];
  content?: unknown;
  tool_call_id?: unknown;
  status?: unknown;
}

export interface FailureRoundView {
  failedSignatures: string[];
  hasResults: boolean;
  allError: boolean;
}

/** Segments messages since the last human message into completed tool
 * rounds. Pending calls without results yet are excluded so guards judge
 * finished work, never work in flight. */
export function failureRoundsSinceLastHuman(
  messages: MessageLike[],
): FailureRoundView[] {
  let start = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].type === "human") {
      start = i + 1;
      break;
    }
  }

  const rounds: FailureRoundView[] = [];
  let calls: Array<{ signature: string; id: string }> = [];
  let results: Array<{ id: string | undefined; negative: boolean }> = [];
  const flush = () => {
    if (calls.length === 0 && results.length === 0) return;
    const failed = new Set(
      results.filter((r) => r.negative).map((r) => r.id),
    );
    rounds.push({
      failedSignatures: calls
        .filter((c) => failed.has(c.id))
        .map((c) => c.signature),
      hasResults: results.length > 0,
      allError: results.length > 0 && results.every((r) => r.negative),
    });
    calls = [];
    results = [];
  };

  for (const msg of messages.slice(start)) {
    if (msg.type === "ai") {
      const toolCalls = msg.tool_calls ?? [];
      if (toolCalls.length > 0) {
        flush();
        calls = toolCalls.map((tc, index) => ({
          signature: toolCallSignature(tc.name, tc.args),
          id: toolCallResultId(tc, index),
        }));
      }
    } else if (msg.type === "tool") {
      results.push({
        id: typeof msg.tool_call_id === "string" ? msg.tool_call_id : undefined,
        negative: isNegativeToolResult({
          content: msg.content,
          status: msg.status,
        }),
      });
    }
  }
  flush();
  return rounds.filter((r) => r.hasResults);
}

/** True when the last three completed rounds each contain a failed call
 * with a shared signature: the same broken call failing on repeat. */
export function hasIdenticalFailureLoop(rounds: FailureRoundView[]): boolean {
  const window = rounds.slice(-MAX_IDENTICAL_FAILURE_ROUNDS);
  if (window.length < MAX_IDENTICAL_FAILURE_ROUNDS) return false;
  if (window.some((r) => r.failedSignatures.length === 0)) return false;
  const shared = new Set(window[0].failedSignatures);
  for (const round of window.slice(1)) {
    for (const signature of [...shared]) {
      if (!round.failedSignatures.includes(signature)) shared.delete(signature);
    }
  }
  return shared.size > 0;
}

/** True when the last three completed rounds all failed outright:
 * flailing across different calls, no round making progress. */
export function hasConsecutiveErrorStreak(rounds: FailureRoundView[]): boolean {
  const window = rounds.slice(-MAX_CONSECUTIVE_ERROR_ROUNDS);
  if (window.length < MAX_CONSECUTIVE_ERROR_ROUNDS) return false;
  return window.every((r) => r.allError);
}

/** Trailing run length of rounds containing this failed signature.
 * Feeds the diagnosis state so Jev sees how stuck the call is. */
export function trailingIdenticalFailureCount(
  rounds: FailureRoundView[],
  signature: string,
): number {
  let count = 0;
  for (let i = rounds.length - 1; i >= 0; i--) {
    if (!rounds[i].failedSignatures.includes(signature)) break;
    count++;
  }
  return count;
}
