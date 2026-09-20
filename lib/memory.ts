"use server";

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { MessageRole } from "@/lib/schemas/chat";
import {
  addMemories,
  searchMemories,
  type Mem0ConfigSettings,
} from "@mem0/vercel-ai-provider";
import { buildMemoryLookupQueries } from "@/lib/chat/requestMediator";
import { logError, logMetric, logWarn } from "@/lib/observability";
import { isRecord } from "@/lib/typeGuards";
import { gateMemoryEvidence } from "@/lib/jev/memoryEvidenceGate";
import { shadowMemoryStorageWorthiness } from "@/lib/jev/memoryStorageShadow";

const MEM0_API_KEY = process.env.MEM0_API_KEY;

if (!MEM0_API_KEY) {
  logWarn({
    event: "mem0_disabled",
    message: "MEM0_API_KEY not configured - memory features disabled",
  });
}

interface MemoryLookupOptions {
  recentConversation?: string;
  conversationId?: string;
  signal?: AbortSignal;
}

interface MemoryContextResult {
  context: string;
  failed: boolean;
  error?: string;
}

interface MemorySearchRecord {
  id?: string;
  memory?: string;
  score?: number;
  updatedAt?: string;
}

type SearchConfig = Mem0ConfigSettings & {
  top_k?: number;
  keyword_search?: boolean;
  rerank?: boolean;
  threshold?: number;
};

function normalizeMemoryText(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

function extractMemorySearchRecords(value: unknown): MemorySearchRecord[] {
  const rawItems = Array.isArray(value)
    ? value
    : value &&
        typeof value === "object" &&
        Array.isArray((value as { results?: unknown[] }).results)
      ? (value as { results: unknown[] }).results
      : [];

  return rawItems.flatMap(
    (
      item,
    ): Array<{
      id: string | undefined;
      memory: string | undefined;
      score: number | undefined;
      updatedAt: string | undefined;
    }> => {
      if (!isRecord(item)) return [];
      const memory =
        typeof item.memory === "string"
          ? normalizeMemoryText(item.memory)
          : undefined;
      if (!memory) return [];
      return [
        {
          id: typeof item.id === "string" ? item.id : undefined,
          memory,
          score: typeof item.score === "number" ? item.score : undefined,
          updatedAt:
            typeof item.updated_at === "string" ? item.updated_at : undefined,
        },
      ];
    },
  );
}

function dedupeMemorySearchRecords(
  records: MemorySearchRecord[],
): MemorySearchRecord[] {
  const seen = new Set<string>();
  const deduped: MemorySearchRecord[] = [];

  for (const record of records.sort(
    (left, right) => (right.score ?? 0) - (left.score ?? 0),
  )) {
    const key = record.id || record.memory?.toLowerCase();
    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(record);
  }

  return deduped;
}

function formatMemoryContext(records: MemorySearchRecord[]): string {
  return [
    "Relevant memories from prior conversations:",
    ...records.map((record, index) => `${index + 1}. ${record.memory}`),
  ].join("\n");
}

export async function storeConversationMemory(
  userMessage: string,
  assistantMessage: string,
  userId: string,
): Promise<void> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || session.user.id !== userId) {
    return;
  }

  if (!MEM0_API_KEY || process.env.MEMORY_ENABLED === "false") {
    return;
  }

  const normalizedUserMessage = userMessage.trim();
  const normalizedAssistantMessage = assistantMessage.trim();
  if (!normalizedUserMessage || !normalizedAssistantMessage) {
    return;
  }

  try {
    const messages = [
      {
        role: MessageRole.USER,
        content: [{ type: "text" as const, text: normalizedUserMessage }],
      },
      {
        role: MessageRole.ASSISTANT,
        content: [{ type: "text" as const, text: normalizedAssistantMessage }],
      },
    ];

    const [shadowResult, storeResult] = await Promise.allSettled([
      shadowMemoryStorageWorthiness(
        normalizedUserMessage,
        normalizedAssistantMessage,
      ),
      addMemories(messages, {
        user_id: userId,
        mem0ApiKey: MEM0_API_KEY,
      }),
    ]);
    if (shadowResult.status === "rejected") {
      logWarn({
        event: "jev_memory_storage_shadow_failed",
        error:
          shadowResult.reason instanceof Error
            ? shadowResult.reason.message
            : String(shadowResult.reason),
      });
    }
    if (storeResult.status === "rejected") throw storeResult.reason;
  } catch (error) {
    logError({
      event: "mem0_store_failed",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function getMemoryContextResult(
  query: string,
  userId: string,
  options?: MemoryLookupOptions,
): Promise<MemoryContextResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || session.user.id !== userId) {
    return { context: "", failed: false };
  }

  if (!MEM0_API_KEY || process.env.MEMORY_ENABLED === "false") {
    return { context: "", failed: false };
  }

  try {
    const searchConfig: SearchConfig = {
      user_id: userId,
      mem0ApiKey: MEM0_API_KEY,
      top_k: 5,
      keyword_search: true,
      rerank: true,
      threshold: 0.15,
    };

    const lookupQueries = buildMemoryLookupQueries(
      query,
      options?.recentConversation,
    );
    const retrievalStarted = Date.now();
    logMetric({
      metric: "memory_search_calls",
      value: lookupQueries.length,
      unit: "count",
    });
    const deadline = AbortSignal.timeout(3_500);
    const signal = options?.signal
      ? AbortSignal.any([options.signal, deadline])
      : deadline;
    const searchBatch = Promise.allSettled(
      lookupQueries.map(async (lookupQuery) => {
        if (signal.aborted) throw signal.reason;
        const result = await searchMemories(lookupQuery, searchConfig);
        if (signal.aborted) throw signal.reason;
        return extractMemorySearchRecords(result);
      }),
    );
    const settledSearchResults = await Promise.race([
      searchBatch,
      new Promise<never>((_, reject) => {
        if (signal.aborted) return reject(signal.reason);
        signal.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        });
      }),
    ]);
    const searchResults = settledSearchResults.flatMap((result, index) => {
      if (result.status === "fulfilled") {
        return [result.value];
      }

      logWarn({
        event: "mem0_memory_search_failed",
        query: lookupQueries[index],
        error:
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason),
      });
      return [];
    });
    if (settledSearchResults.every((result) => result.status === "rejected")) {
      return { context: "", failed: true, error: "All memory searches failed" };
    }

    const records = dedupeMemorySearchRecords(searchResults.flat()).slice(0, 6);
    if (records.length > 0) {
      const accepted = await gateMemoryEvidence(
        query,
        records.flatMap((record) =>
          record.memory ? [{ ...record, memory: record.memory }] : [],
        ),
        options?.conversationId,
        signal,
      );
      logMetric({
        metric: "memory_retrieval_latency_ms",
        value: Date.now() - retrievalStarted,
        unit: "ms",
      });
      logMetric({
        metric: "memory_candidates_injected",
        value: accepted.length,
        unit: "count",
      });
      return {
        context: accepted.length ? formatMemoryContext(accepted) : "",
        failed: false,
      };
    }

    logMetric({
      metric: "memory_retrieval_latency_ms",
      value: Date.now() - retrievalStarted,
      unit: "ms",
    });
    return { context: "", failed: false };
  } catch (error) {
    logError({
      event: "mem0_retrieve_failed",
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      context: "",
      failed: true,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
