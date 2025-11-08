import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { HOOK_ERROR_MESSAGES } from "@/constants/errors";
import { checkSemanticCacheAction, saveToSemanticCacheAction } from "@/lib/rag/storage/cache-actions";

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
      const result = await checkSemanticCacheAction(query);

      if (result.error) {
        throw new Error(result.error);
      }

      return {
        cached: result.cached,
        response: result.response,
      };
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
      const result = await saveToSemanticCacheAction(query, response);

      if (!result.success) {
        throw new Error(result.error || HOOK_ERROR_MESSAGES.FAILED_SAVE_CACHE);
      }

      return result;
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
