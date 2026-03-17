import OpenAI from "openai";
import { wrapOpenAIWithLangSmith } from "@/lib/langsmith-config";
import { getSupportedTemperature } from "@/lib/model-policy";

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

const NORMALIZATION_REPLACEMENTS = [
  { pattern: /\bu\b/gi, replacement: "you" },
  { pattern: /\bur\b/gi, replacement: "your" },
  { pattern: /\bya\b/gi, replacement: "you" },
] as const;

const STRONG_MEMORY_TRUE_PATTERNS = [
  /\b(do you have any context about me|what do you know about me|tell me about myself)\b/i,
  /\b(what have i shared|what do you remember about me|my background|my preferences|what'?s my name|who am i)\b/i,
  /\b(do|did|can|could|would)\s+(you)\s+(remember|recall|know)\s+(me|my name|anything about me)\b/i,
  /\b(remember me|know me|what should you call me|what is my latest project|what'?s my latest project)\b/i,
  /\b(have we talked before|did we talk before|what did i ask you|what did i tell you|did i mention)\b/i,
  /\b(remind me what you know about me|remind me what i told you|do you still know my name)\b/i,
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
  /\b(what should you call me|do you know my name|do you remember me|what'?s my latest project|what is my latest project)\b/i,
  /\b(have we talked before|did we talk before|what did i ask you|what did i tell you|did i mention|do you still know)\b/i,
  /\b(remind me what i told you|remind me what you know about me|what did i ask you today|what did i ask you earlier)\b/i,
] as const;

const PERSONAL_REFERENCE_PATTERNS = [
  /\b(i|i'm|i am|me|my|mine|myself)\b/i,
] as const;

const MEMORY_ACTION_PATTERNS = [
  /\b(remember|recall|know|shared|told|mentioned|context|background|preferences|goals|project|name|about me|asked|said|talked|chatted|conversation)\b/i,
] as const;

function trimAndNormalize(text: string): string {
  const replaced = NORMALIZATION_REPLACEMENTS.reduce((value, { pattern, replacement }) => {
    return value.replace(pattern, replacement);
  }, text);

  return replaced.trim().replace(/\s+/g, " ");
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

export function buildMemoryLookupQueries(
  messageText: string,
  recentConversation?: string
): string[] {
  const normalized = trimAndNormalize(messageText).toLowerCase();
  const queries = new Set<string>([trimAndNormalize(messageText)]);

  const recentConversationSummary = trimAndNormalize(recentConversation || "");
  const isNameQuery = /\b(name|call me|nickname|what should you call me)\b/i.test(normalized);
  const isProjectQuery = /\b(project|building|working on|latest project|current project)\b/i.test(normalized);
  const isPreferenceQuery = /\b(prefer|preference|like|favorite|favourite)\b/i.test(normalized);
  const isGoalQuery = /\b(goal|goals|aim|objective|trying to)\b/i.test(normalized);
  const isBackgroundQuery = /\b(background|bio|biography|role|job|work|who am i|where am i from)\b/i.test(normalized);
  const isConversationRecallQuery = /\b(what did i ask|what did i tell you|did i mention|have we talked before|did we talk before|today|earlier|last time)\b/i.test(normalized);
  const isGeneralRecall = matchesAny(normalized, MEMORY_INTENT_PATTERNS);

  if (recentConversationSummary) {
    queries.add(
      `Recent conversation recap for user memory lookup:\n${recentConversationSummary}\n\nCurrent question: ${trimAndNormalize(messageText)}`
    );
  }

  if (isNameQuery) {
    queries.add("user name preferred name nickname what assistant should call user");
  }

  if (isProjectQuery) {
    queries.add("user current project latest project what user is building");
  }

  if (isPreferenceQuery) {
    queries.add("user preferences likes dislikes favorites favorite tools");
  }

  if (isGoalQuery) {
    queries.add("user goals priorities objectives what user wants to achieve");
  }

  if (isBackgroundQuery) {
    queries.add("user background biography role job work profile");
  }

  if (isConversationRecallQuery) {
    queries.add("user prior questions requests and facts from recent conversations");
    queries.add("what the user asked or said in previous chats");
  }

  if (isGeneralRecall || queries.size === 1) {
    queries.add("facts about the user from prior conversations");
    queries.add("what do you know about me");
  }

  return Array.from(queries)
    .map((query) => trimAndNormalize(query))
    .filter(Boolean)
    .slice(0, 5);
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
    const temperature = getSupportedTemperature(MEDIATOR_MODEL, 0);
    const completion = await openai.chat.completions.create({
      model: MEDIATOR_MODEL,
      ...(temperature !== undefined ? { temperature } : {}),
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You classify whether a chat request should retrieve prior personal conversation memory about the user. " +
            "Return strict JSON with one top-level key called memory. " +
            "Set memory.should_query true for requests like 'what do you know about me', 'do you have any context about me', 'do you know my name', 'what should you call me', or explicit recall of prior chats. " +
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
