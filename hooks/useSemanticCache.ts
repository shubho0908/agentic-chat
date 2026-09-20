import { useMutation, useQueryClient } from "@tanstack/react-query";
import { HOOK_ERROR_MESSAGES } from "@/constants/errors";
import { saveToSemanticCacheAction } from "@/lib/rag/storage/cacheActions";
import { queryKeys } from "@/lib/queryKeys";
import { logger } from "@/lib/logger";

interface CacheSavePayload {
  query: string;
  response: string;
  model: string;
  reasoningEffort?: string | null;
}

export function useSaveToCache() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ query, response, model, reasoningEffort }: CacheSavePayload) => {
      const result = await saveToSemanticCacheAction(query, response, undefined, model, reasoningEffort ?? null);

      if (!result.success) {
        throw new Error(result.error || HOOK_ERROR_MESSAGES.FAILED_SAVE_CACHE);
      }

      return result;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.semanticCache(variables.query),
      });
    },
    onError: (error) => {
      logger.error("Cache save error:", error);
    },
  });
}
