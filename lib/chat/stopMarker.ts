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
 * user message). Client, stop endpoint, and stream-abort path all compute the
 * same id, so concurrent marker writes collapse into one row via the primary
 * key (INSERT ... ON CONFLICT DO NOTHING semantics).
 */
export function getStreamStoppedMarkerMessageId(
  conversationId: string,
  userMessageId: string,
): string {
  return `stopmsg-${conversationId}-${userMessageId}`;
}
