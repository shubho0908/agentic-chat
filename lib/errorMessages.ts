const USER_FRIENDLY_FALLBACK = "Something went wrong. Please try again.";

const KNOWN_PATTERNS: [RegExp, string][] = [
  [/sending messages too quickly|please wait about/i, "You're sending messages too quickly. Take a short break and try again."],
  [/rate.?limit|too many requests/i, "You're sending messages too quickly. Please wait a moment and try again."],
  [/insufficient.?quota|quota exceeded/i, "Your API key has run out of credits. Please check your billing settings."],
  [/invalid.?api.?key|incorrect.?api.?key|authentication/i, "Your API key appears to be invalid. Please check your settings."],
  [/context.?length.?exceeded|token.?budget/i, "The conversation is too long. Please start a new chat or shorten your message."],
  [/model.*not found|does not exist/i, "The selected model is unavailable. Please choose another."],
  [/network|ECONNREFUSED|ECONNRESET|ETIMEDOUT|fetch failed/i, "Having trouble connecting. Please check your internet and try again."],
  [/timeout|timed?\s*out|deadline exceeded/i, "The request took too long. Please try again."],
  [/abort/i, "Request was cancelled."],
  [/server error|internal server|500/i, "Something went wrong on our end. Please try again in a moment."],
  [/search providers?.*(unavailable|failed)/i, "Web search is temporarily unavailable. The response will use existing knowledge instead."],
  [/not found|404/i, "The requested resource was not found."],
  [/unauthorized|401|forbidden|403/i, "Your session may have expired. Please sign in again."],
  [/bad request|validation|invalid/i, "Something wasn't right with that request. Please try again."],
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
