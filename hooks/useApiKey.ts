import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface ApiKeyResponse {
  exists: boolean;
  apiKey: string | null;
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
          return { exists: false, apiKey: null };
        }
        throw new Error("Failed to fetch API key");
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
        throw new Error("Failed to delete API key");
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

export async function getApiKeyHash(): Promise<string | null> {
  try {
    const response = await fetch("/api/settings/api-key", {
      method: "GET",
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    if (!data.exists || !data.apiKey) {
      return null;
    }

    const encoder = new TextEncoder();
    const encodedData = encoder.encode(data.apiKey);
    const hashBuffer = await crypto.subtle.digest("SHA-256", encodedData);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch (error) {
    console.error("Error getting API key hash:", error);
    return null;
  }
}
