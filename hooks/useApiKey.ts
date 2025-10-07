import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { HOOK_ERROR_MESSAGES } from "@/constants/errors";

interface ApiKeyResponse {
  exists: boolean;
  maskedKey: string | null;
  updatedAt: string | null;
}

export function useApiKey() {
  return useQuery<ApiKeyResponse>({
    queryKey: ["api-key"],
    queryFn: async () => {
      const response = await fetch("/api/settings/api-key", {
        method: "GET",
      });

      if (!response.ok) {
        if (response.status === 401) {
          return { exists: false, maskedKey: null, updatedAt: null };
        }
        throw new Error(HOOK_ERROR_MESSAGES.FAILED_FETCH_API_KEY);
      }

      return response.json();
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: false,
  });
}

export function useApiKeyMutations() {
  const queryClient = useQueryClient();

  const saveApiKey = useMutation({
    mutationFn: async (apiKey: string) => {
      const response = await fetch("/api/settings/api-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to save API key");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-key"] });
    },
  });

  const deleteApiKey = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/settings/api-key", {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error(HOOK_ERROR_MESSAGES.FAILED_DELETE_API_KEY);
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-key"] });
    },
  });

  return {
    saveApiKey,
    deleteApiKey,
  };
}
