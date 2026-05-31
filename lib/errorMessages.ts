const USER_FRIENDLY_FALLBACK = "Something went wrong. Please try again.";

const KNOWN_PATTERNS: [RegExp, string][] = [
  [/rate.?limit|too many requests/i, "You're sending messages too quickly. Please wait a moment."],
  [/insufficient.?quota|quota exceeded/i, "Your API key has run out of credits."],
  [/invalid.?api.?key|incorrect.?api.?key|authentication/i, "Your API key is invalid. Please check your settings."],
  [/context.?length.?exceeded|token.?budget/i, "The conversation is too long. Please start a new chat."],
  [/model.*not found|does not exist/i, "The selected model is unavailable. Please choose another."],
  [/network|ECONNREFUSED|ECONNRESET|ETIMEDOUT|fetch failed/i, "Network error. Please check your connection and try again."],
  [/timeout|timed?\s*out|deadline exceeded/i, "The request timed out. Please try again."],
  [/abort/i, "Request was cancelled."],
  [/server error|internal server|500/i, "A server error occurred. Please try again later."],
  [/too many requests/i, "Too many requests. Please slow down."],
  [/not found|404/i, "The requested resource was not found."],
  [/unauthorized|401|forbidden|403/i, "You don't have permission. Please sign in again."],
  [/bad request|validation|invalid/i, "The request was invalid. Please try again."],
];

export function toUserFriendlyError(error: unknown, fallback?: string): string {
  const message = error instanceof Error
    ? error.message
    : typeof error === "string"
      ? error
      : "";

  if (!message) return fallback || USER_FRIENDLY_FALLBACK;

  for (const [pattern, friendly] of KNOWN_PATTERNS) {
    if (pattern.test(message)) return friendly;
  }

  return fallback || USER_FRIENDLY_FALLBACK;
}
