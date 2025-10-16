import { useQuery } from "@tanstack/react-query";
import type { DeepResearchUsageInfo } from "@/lib/deep-research-usage";

/**
 * Hook to fetch deep research usage information
 * Uses TanStack Query for caching and automatic refetching
 */
export function useDeepResearchUsage() {
  return useQuery<DeepResearchUsageInfo>({
    queryKey: ['deep-research-usage'],
    queryFn: async () => {
      const response = await fetch('/api/deep-research/usage');
      
      if (!response.ok) {
        throw new Error('Failed to fetch deep research usage');
      }
      
      return response.json();
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    retry: 2,
  });
}
