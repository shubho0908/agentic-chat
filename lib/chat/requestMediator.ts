import { isExplicitMemoryRecall } from "@/lib/jev/memoryGate";

function trimAndNormalize(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}
export function buildMemoryLookupQueries(
  messageText: string,
  recentConversation?: string,
): string[] {
  const original = trimAndNormalize(messageText),
    normalized = original.toLowerCase();
  let rewrite: string | undefined;
  if (/\b(name|call me|nickname|naam)\b/i.test(normalized))
    rewrite = "user preferred name and nickname";
  else if (/\b(project|building|working on|stack)\b/i.test(normalized))
    rewrite = "user current project technology stack and current work";
  else if (/\b(prefer|preference|like|favorite|favourite)\b/i.test(normalized))
    rewrite = "user preferences likes dislikes and favorites";
  else if (/\b(goal|role|job|target)\b/i.test(normalized))
    rewrite = "user goals target roles priorities and objectives";
  else if (isExplicitMemoryRecall(normalized))
    rewrite = `facts about the user from prior conversations${recentConversation ? ` related to: ${trimAndNormalize(recentConversation).slice(-300)}` : ""}`;
  return rewrite && rewrite !== original ? [original, rewrite] : [original];
}
export { mediateMemoryIntent } from "@/lib/jev/memoryGate";
