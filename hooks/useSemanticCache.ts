import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface CacheCheckResponse {
  cached: boolean;
  response?: string;
}

interface CacheSavePayload {
  query: string;
  response: string;
  userHash: string;
}

export function useSemanticCache(query: string, userHash: string | null, enabled: boolean = true) {
  return useQuery<CacheCheckResponse>({
    queryKey: ["agentic-chat-cache", query, userHash],
    queryFn: async () => {
      if (!userHash) {
        throw new Error("User hash is required");
      }

      const response = await fetch("/api/cache/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, userHash }),
      });

      if (!response.ok) {
        throw new Error("Cache check failed");
      }

      return response.json();
    },
    enabled: enabled && !!query && !!userHash,
    staleTime: 5 * 60 * 1000, // 5 minutes - complements Qdrant cache
    gcTime: 10 * 60 * 1000, // 10 minutes garbage collection
  });
}

export function useSaveToCache() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ query, response, userHash }: CacheSavePayload) => {
      const res = await fetch("/api/cache/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, response, userHash }),
      });

      if (!res.ok) {
        throw new Error("Failed to save to cache");
      }

      return res.json();
    },
    onSuccess: (_, variables) => {
      // Invalidate the cache query to update the local cache state
      queryClient.invalidateQueries({
        queryKey: ["agentic-chat-cache", variables.query, variables.userHash],
      });
    },
    // Silent fail - don't throw if cache save fails
    onError: (error) => {
      console.error("Cache save error:", error);
    },
  });
}
