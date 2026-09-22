const THREAD_PART_MAX = 160;

function encodeThreadPart(value: string): string {
  return encodeURIComponent(value.trim()).slice(0, THREAD_PART_MAX);
}

export function deriveThreadId(conversationId: string, branchId?: string): string {
  const root = `conv:${encodeThreadPart(conversationId)}`;
  return branchId ? `${root}:branch:${encodeThreadPart(branchId)}` : root;
}
