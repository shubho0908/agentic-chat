import type { Attachment } from "@/lib/schemas/chat";
import { RoutingDecision, type MemoryStatus } from "@/types/chat";

export type MemoryPersistenceFlow = "send" | "edit" | "regenerate";

interface MemoryPersistenceArgs {
  userMessage: string;
  assistantMessage: string;
  activeTool?: string | null;
  deepResearchEnabled?: boolean;
  userAttachments?: Attachment[];
  memoryStatus?: Pick<MemoryStatus, "routingDecision">;
  flow?: MemoryPersistenceFlow;
}

const LOW_SIGNAL_USER_PATTERNS = [
  /^(hi|hello|hey|yo|sup)\b[!.? ]*$/i,
  /^(thanks|thank you|thx|ok|okay|cool|nice|great|awesome|sure)\b[!.? ]*$/i,
  /^(test|testing)\b[!.? ]*$/i,
] as const;

const LOW_SIGNAL_ASSISTANT_PATTERNS = [
  /^i can(?:not|'t)\s+(access|open|view)\b/i,
  /^i(?:'m| am)\s+sorry\b/i,
  /^let me know\b/i,
] as const;

const PERSONAL_SIGNAL_PATTERNS = [
  /\b(i am|i'm|my|me|mine|myself)\b/i,
  /\b(call me|name is|i work|i use|i prefer|i like|i want|my goal|my project)\b/i,
] as const;

const GENERIC_QUERY_PATTERNS = [
  /^(what|who|when|where|why|how)\b/i,
  /^(explain|define|compare|summarize|write|draft|fix|debug|build|create|analyze)\b/i,
] as const;

const NON_PERSISTED_ROUTING_DECISIONS = new Set<RoutingDecision>([
  RoutingDecision.DocumentsOnly,
  RoutingDecision.VisionOnly,
  RoutingDecision.UrlContent,
  RoutingDecision.ToolOnly,
  RoutingDecision.Hybrid,
]);

function normalize(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

function matchesAny(text: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function isPersonalSignal(text: string): boolean {
  return matchesAny(text, PERSONAL_SIGNAL_PATTERNS);
}

export function shouldPersistConversationMemory({
  userMessage,
  assistantMessage,
  activeTool,
  deepResearchEnabled = false,
  userAttachments,
  memoryStatus,
  flow = "send",
}: MemoryPersistenceArgs): boolean {
  const normalizedUser = normalize(userMessage);
  const normalizedAssistant = normalize(assistantMessage);

  if (!normalizedUser || !normalizedAssistant) {
    return false;
  }

  if (flow === "regenerate") {
    return false;
  }

  if (deepResearchEnabled || activeTool) {
    return false;
  }

  if ((userAttachments?.length || 0) > 0) {
    return false;
  }

  if (
    memoryStatus?.routingDecision &&
    NON_PERSISTED_ROUTING_DECISIONS.has(memoryStatus.routingDecision)
  ) {
    return false;
  }

  if (matchesAny(normalizedUser, LOW_SIGNAL_USER_PATTERNS)) {
    return false;
  }

  if (normalizedAssistant.length < 24 || matchesAny(normalizedAssistant, LOW_SIGNAL_ASSISTANT_PATTERNS)) {
    return false;
  }

  if (
    normalizedUser.length < 12 &&
    !isPersonalSignal(normalizedUser)
  ) {
    return false;
  }

  if (
    matchesAny(normalizedUser, GENERIC_QUERY_PATTERNS) &&
    !isPersonalSignal(normalizedUser)
  ) {
    return false;
  }

  return true;
}

export function estimateMemoryEntryCount(memoryContext: string): number {
  const trimmed = memoryContext.trim();
  if (!trimmed) {
    return 0;
  }

  const enumeratedMatches = trimmed.match(/(?:^|\n)\s*(?:\d+[\).\s]|[-*•]\s+)/g);
  if (enumeratedMatches && enumeratedMatches.length > 0) {
    return enumeratedMatches.length;
  }

  return 1;
}
