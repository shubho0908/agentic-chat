/**
 * Sentinel assistant-message content recording that the user stopped a
 * stream. It is non-empty on purpose: the auto-continue resume logic only
 * fires when a conversation ends at a user message or an empty assistant
 * message, so a persisted marker makes "retry after a user stop" impossible
 * even after a refresh. The client hides it (chatMessage.tsx).
 */
export const STREAM_STOPPED_BY_USER_MARKER = "[[__stream_stopped_by_user_v1__]]";

/**
 * Deterministic marker row id, scoped to the turn (conversation + triggering
 * user message). Both explicit-stop writers (the stop endpoint and the
 * client's scoped marker save) compute the same id, so concurrent marker
 * writes collapse into one row via the primary key (INSERT ... ON CONFLICT
 * DO NOTHING semantics).
 */
export function getStreamStoppedMarkerMessageId(
  conversationId: string,
  userMessageId: string,
): string {
  return `stopmsg-${conversationId}-${userMessageId}`;
}

/**
 * Recovers the turn scope from a deterministic marker id. Returns null for
 * foreign-conversation or malformed ids so callers can refuse the write
 * instead of marking unscoped.
 */
export function parseStreamStoppedMarkerMessageId(
  conversationId: string,
  markerMessageId: string,
): string | null {
  const prefix = `stopmsg-${conversationId}-`;
  if (!markerMessageId.startsWith(prefix)) return null;
  const userMessageId = markerMessageId.slice(prefix.length);
  return userMessageId.length > 0 ? userMessageId : null;
}

/** The single predicate behind the completion first-writer-wins drop check. */
export function isStreamStoppedMarkerMessage(
  message: { role: string; content: string } | null | undefined,
): boolean {
  return (
    !!message &&
    message.role === "ASSISTANT" &&
    message.content === STREAM_STOPPED_BY_USER_MARKER
  );
}
