import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { HOOK_ERROR_MESSAGES } from "@/constants/errors";

interface CacheCheckResponse {
  cached: boolean;
  response?: string;
}

interface CacheSavePayload {
  query: string;
  response: string;
}

export function useSemanticCache(query: string, enabled: boolean = true) {
  return useQuery<CacheCheckResponse>({
    queryKey: ["agentic-chat-cache", query],
    queryFn: async () => {
      const response = await fetch("/api/cache/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });

      if (!response.ok) {
        throw new Error(HOOK_ERROR_MESSAGES.FAILED_CACHE_CHECK);
      }

      return response.json();
    },
    enabled: enabled && !!query,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

export function useSaveToCache() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ query, response }: CacheSavePayload) => {
      const res = await fetch("/api/cache/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, response }),
      });

      if (!res.ok) {
        throw new Error(HOOK_ERROR_MESSAGES.FAILED_SAVE_CACHE);
      }

      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["agentic-chat-cache", variables.query],
      });
    },
    onError: (error) => {
      console.error("Cache save error:", error);
    },
  });
}
