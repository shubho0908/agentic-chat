import OpenAI from "openai";
import { wrapOpenAIWithLangSmith } from "@/lib/langsmith-config";

const MEDIATOR_MODEL = "gpt-5-nano";
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_SIZE = 500;

interface CachedDecision {
  value: MemoryIntentDecision;
  timestamp: number;
}

interface MemoryIntentDecision {
  shouldQuery: boolean;
}

interface RequestMediatorArgs {
  messageText: string;
  recentConversation?: string;
  apiKey?: string;
}

const decisionCache = new Map<string, CachedDecision>();

const STRONG_MEMORY_TRUE_PATTERNS = [
  /\b(do you have any context about me|what do you know about me|tell me about myself)\b/i,
  /\b(what have i shared|what do you remember about me|my background|my preferences|what'?s my name|who am i)\b/i,
] as const;

const STRONG_MEMORY_FALSE_PATTERNS = [
  /\b(this|that|the)\s+(document|file|attachment|image|picture|pdf)\b/i,
  /\b(attached|uploaded|upload|screenshot|image above|file above|pdf above)\b/i,
] as const;

const MEMORY_INTENT_PATTERNS = [
  /\b(remember|recall|earlier|before|previously|last time|when we talked|what have i shared)\b/i,
  /\b(context about me|know about me|what do you know about me|tell me about myself)\b/i,
  /\b(my background|my preferences|my goals|my goal|my project|my name|who am i|what do i do|where am i from)\b/i,
  /\b(what have i told you|what do you remember about me|anything about me)\b/i,
] as const;

const PERSONAL_REFERENCE_PATTERNS = [
  /\b(i|i'm|i am|me|my|mine|myself)\b/i,
] as const;

const MEMORY_ACTION_PATTERNS = [
  /\b(remember|recall|know|shared|told|mentioned|context|background|preferences|goals|project|name|about me)\b/i,
] as const;

function trimAndNormalize(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

function cacheKey(messageText: string, recentConversation?: string): string {
  return JSON.stringify({
    messageText: trimAndNormalize(messageText).toLowerCase(),
    recentConversation: trimAndNormalize(recentConversation || "").toLowerCase().slice(-600),
  });
}

function readCache(key: string): MemoryIntentDecision | null {
  const cached = decisionCache.get(key);
  if (!cached) return null;

  if (Date.now() - cached.timestamp > CACHE_TTL_MS) {
    decisionCache.delete(key);
    return null;
  }

  return cached.value;
}

function writeCache(key: string, value: MemoryIntentDecision) {
  decisionCache.set(key, {
    value,
    timestamp: Date.now(),
  });

  if (decisionCache.size <= CACHE_MAX_SIZE) {
    return;
  }

  const entries = Array.from(decisionCache.entries()).sort(
    (left, right) => left[1].timestamp - right[1].timestamp
  );

  for (const [entryKey] of entries.slice(0, decisionCache.size - CACHE_MAX_SIZE)) {
    decisionCache.delete(entryKey);
  }
}

function matchesAny(text: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function getFastMemoryDecision(text: string): MemoryIntentDecision | null {
  if (matchesAny(text, STRONG_MEMORY_TRUE_PATTERNS)) {
    return {
      shouldQuery: true,
    };
  }

  if (matchesAny(text, STRONG_MEMORY_FALSE_PATTERNS)) {
    return {
      shouldQuery: false,
    };
  }

  return null;
}

function shouldRunMediator(text: string): boolean {
  if (matchesAny(text, MEMORY_INTENT_PATTERNS)) {
    return true;
  }

  return (
    matchesAny(text, PERSONAL_REFERENCE_PATTERNS) &&
    matchesAny(text, MEMORY_ACTION_PATTERNS)
  );
}

async function runAIMediator({
  messageText,
  recentConversation,
  apiKey,
}: RequestMediatorArgs): Promise<MemoryIntentDecision | null> {
  if (!apiKey) {
    return null;
  }

  const openai = wrapOpenAIWithLangSmith(new OpenAI({ apiKey }));

  try {
    const completion = await openai.chat.completions.create({
      model: MEDIATOR_MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You classify whether a chat request should retrieve prior personal conversation memory about the user. " +
            "Return strict JSON with one top-level key called memory. " +
            "Set memory.should_query true for requests like 'what do you know about me', 'do you have any context about me', or explicit recall of prior chats. " +
            "Set memory.should_query false for current attachments, generic knowledge, or requests that do not need prior personal context.",
        },
        {
          role: "user",
          content: JSON.stringify({
            message_text: messageText,
            recent_conversation: recentConversation || "",
            output_shape: {
              memory: {
                should_query: "boolean",
              },
            },
          }),
        },
      ],
    });

    const rawContent = completion.choices[0]?.message?.content;
    if (typeof rawContent !== "string") {
      return null;
    }

    const parsed = JSON.parse(rawContent) as {
      memory?: {
        should_query?: boolean;
      };
    };

    return {
      shouldQuery: Boolean(parsed.memory?.should_query),
    };
  } catch (error) {
    console.error("[Request Mediator] AI classification failed:", error);
    return null;
  }
}

export async function mediateMemoryIntent({
  messageText,
  recentConversation,
  apiKey,
}: RequestMediatorArgs): Promise<MemoryIntentDecision> {
  const normalized = trimAndNormalize(messageText);
  const key = cacheKey(normalized, recentConversation);
  const cached = readCache(key);
  if (cached) {
    return cached;
  }

  const fastMemory = getFastMemoryDecision(normalized);

  if (fastMemory) {
    writeCache(key, fastMemory);
    return fastMemory;
  }

  if (!shouldRunMediator(normalized)) {
    const decision: MemoryIntentDecision = {
      shouldQuery: false,
    };
    writeCache(key, decision);
    return decision;
  }

  const aiDecision = await runAIMediator({
    messageText: normalized,
    recentConversation,
    apiKey,
  });

  if (aiDecision) {
    writeCache(key, aiDecision);
    return aiDecision;
  }

  const decision: MemoryIntentDecision = {
    shouldQuery: false,
  };

  writeCache(key, decision);
  return decision;
}
