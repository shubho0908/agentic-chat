import type { Mem0ConfigSettings } from "@mem0/vercel-ai-provider";

export type Mem0SearchConfig = Mem0ConfigSettings & {
  top_k?: number;
  keyword_search?: boolean;
  rerank?: boolean;
  threshold?: number;
};

const DEFAULT_MEM0_HOST = "https://api.mem0.ai";

/**
 * @mem0/vercel-ai-provider's searchMemories POSTs to /v2/memories/search/ but
 * accepts no AbortSignal, so a timed-out or cancelled lookup keeps its
 * request running in the background after the caller has already moved on.
 * Issue the identical request ourselves with the caller's signal so
 * cancellation actually aborts the network work.
 *
 * Unlike the SDK wrapper (which swallows errors into []), failures here
 * reject: the caller batches queries with Promise.allSettled and logs each
 * rejection, so error visibility is preserved per query.
 */
export async function searchMemoriesWithSignal(
  query: string,
  config: Mem0SearchConfig,
  signal: AbortSignal,
): Promise<unknown> {
  const { mem0ApiKey, host, ...requestConfig } = config;
  const filters: { OR: Array<Record<string, string>> } = { OR: [] };
  if (config.user_id) filters.OR.push({ user_id: config.user_id });
  if (config.app_id) filters.OR.push({ app_id: config.app_id });
  if (config.agent_id) filters.OR.push({ agent_id: config.agent_id });
  if (config.run_id) filters.OR.push({ run_id: config.run_id });

  const response = await fetch(
    `${host ?? DEFAULT_MEM0_HOST}/v2/memories/search/`,
    {
      method: "POST",
      headers: {
        Authorization: `Token ${mem0ApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        filters,
        ...requestConfig,
        top_k: config.top_k ?? 5,
        version: "v2",
        output_format: "v1.1",
      }),
      signal,
    },
  );
  if (!response.ok) {
    throw new Error(`Mem0 memory search failed with HTTP ${response.status}`);
  }
  return response.json();
}
