'use server';

import {
  addMemories,
  retrieveMemories,
  searchMemories,
  type Mem0ConfigSettings,
} from '@mem0/vercel-ai-provider';
import { buildMemoryLookupQueries } from '@/lib/chat/request-mediator';

const MEM0_API_KEY = process.env.MEM0_API_KEY;

if (!MEM0_API_KEY) {
  console.warn('[Mem0] MEM0_API_KEY not configured - memory features disabled');
}

interface MemoryLookupOptions {
  recentConversation?: string;
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
}

type SearchConfig = Mem0ConfigSettings & {
  top_k?: number;
  keyword_search?: boolean;
  rerank?: boolean;
  threshold?: number;
};

function normalizeMemoryText(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

function extractMemorySearchRecords(value: unknown): MemorySearchRecord[] {
  const rawItems = Array.isArray(value)
    ? value
    : value && typeof value === 'object' && Array.isArray((value as { results?: unknown[] }).results)
      ? (value as { results: unknown[] }).results
      : [];

  return rawItems
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item) => ({
      id: typeof item.id === 'string' ? item.id : undefined,
      memory: typeof item.memory === 'string' ? normalizeMemoryText(item.memory) : undefined,
      score: typeof item.score === 'number' ? item.score : undefined,
    }))
    .filter((item) => Boolean(item.memory));
}

function dedupeMemorySearchRecords(records: MemorySearchRecord[]): MemorySearchRecord[] {
  const seen = new Set<string>();
  const deduped: MemorySearchRecord[] = [];

  for (const record of records.sort((left, right) => (right.score ?? 0) - (left.score ?? 0))) {
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
    'Relevant memories from prior conversations:',
    ...records.map((record, index) => `${index + 1}. ${record.memory}`),
  ].join('\n');
}

export async function storeConversationMemory(
  userMessage: string,
  assistantMessage: string,
  userId: string
): Promise<void> {
  if (!MEM0_API_KEY) {
    return;
  }

  const normalizedUserMessage = userMessage.trim();
  const normalizedAssistantMessage = assistantMessage.trim();
  if (!normalizedUserMessage || !normalizedAssistantMessage) {
    return;
  }

  try {
    const messages = [
      { role: 'user' as const, content: [{ type: 'text' as const, text: normalizedUserMessage }] },
      { role: 'assistant' as const, content: [{ type: 'text' as const, text: normalizedAssistantMessage }] },
    ];

    await addMemories(messages, {
      user_id: userId,
      mem0ApiKey: MEM0_API_KEY,
    });
  } catch (error) {
    console.error('[Mem0] Error storing memory:', error);
  }
}

export async function getMemoryContextResult(
  query: string,
  userId: string,
  options?: MemoryLookupOptions
): Promise<MemoryContextResult> {
  if (!MEM0_API_KEY) {
    return { context: '', failed: false };
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

    const lookupQueries = buildMemoryLookupQueries(query, options?.recentConversation);
    const settledSearchResults = await Promise.allSettled(
      lookupQueries.map(async (lookupQuery) => {
        const result = await searchMemories(lookupQuery, searchConfig);
        return extractMemorySearchRecords(result);
      })
    );
    const searchResults = settledSearchResults.flatMap((result, index) => {
      if (result.status === 'fulfilled') {
        return [result.value];
      }

      console.warn('[Mem0] Memory search query failed:', {
        query: lookupQueries[index],
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
      return [];
    });

    const records = dedupeMemorySearchRecords(searchResults.flat()).slice(0, 6);
    if (records.length > 0) {
      return { context: formatMemoryContext(records), failed: false };
    }

    return {
      context: await retrieveMemories(query, {
      user_id: userId,
      mem0ApiKey: MEM0_API_KEY,
      }) || '',
      failed: false,
    };
  } catch (error) {
    console.error('[Mem0] Error retrieving memory context:', error);
    return {
      context: '',
      failed: true,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
