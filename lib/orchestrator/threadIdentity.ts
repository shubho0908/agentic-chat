import { createHash } from "node:crypto";

const THREAD_PART_MAX = 160;
const HASH_LENGTH = 64;

function encodeThreadPart(value: string): string {
  const encoded = encodeURIComponent(value.trim());
  if (encoded.length <= THREAD_PART_MAX) return encoded;
  const digest = createHash("sha256").update(value.trim()).digest("hex");
  return `${encoded.slice(0, THREAD_PART_MAX - HASH_LENGTH - 1)}:${digest}`;
}

export function deriveThreadId(
  conversationId: string,
  branchId?: string,
): string {
  const root = `conv-${encodeThreadPart(conversationId)}`;
  return branchId ? `${root}:branch:${encodeThreadPart(branchId)}` : root;
}

const BRANCH_SEPARATOR = ":branch:";

/**
 * Accepts exactly the thread IDs this conversation can own: the root thread
 * (`conv-<id>`) or one of its branch threads (`conv-<id>:branch:<branchId>`).
 * encodeThreadPart escapes `:` in both parts, so a conversation id can never
 * forge the branch separator and a foreign thread id can never prefix-match.
 */
export function isThreadIdForConversation(
  threadId: string,
  conversationId: string,
): boolean {
  const root = deriveThreadId(conversationId);
  if (threadId === root) return true;
  const branchPrefix = `${root}${BRANCH_SEPARATOR}`;
  return (
    threadId.startsWith(branchPrefix) && threadId.length > branchPrefix.length
  );
}
