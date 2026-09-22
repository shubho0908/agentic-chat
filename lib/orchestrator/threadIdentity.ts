import { createHash } from "node:crypto";

const THREAD_PART_MAX = 160;
const HASH_LENGTH = 64;

function encodeThreadPart(value: string): string {
  const encoded = encodeURIComponent(value.trim());
  if (encoded.length <= THREAD_PART_MAX) return encoded;
  const digest = createHash("sha256").update(value.trim()).digest("hex");
  return `${encoded.slice(0, THREAD_PART_MAX - HASH_LENGTH - 1)}:${digest}`;
}

export function deriveThreadId(conversationId: string, branchId?: string): string {
  const root = `conv:${encodeThreadPart(conversationId)}`;
  return branchId ? `${root}:branch:${encodeThreadPart(branchId)}` : root;
}
