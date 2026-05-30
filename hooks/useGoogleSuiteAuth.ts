import { useQuery } from '@tanstack/react-query';
import type { GoogleAuthorizationStatus } from '@/types/googleSuite';
import { queryKeys } from '@/lib/queryKeys';
import { apiRoutes } from '@/lib/routes';

interface UseGoogleSuiteAuthOptions {
  enabled?: boolean;
}

async function fetchAuthStatus(): Promise<GoogleAuthorizationStatus> {
  const response = await fetch(apiRoutes.googleSuiteAuthStatus);
  
  if (!response.ok) {
    throw new Error('Failed to check authorization status');
  }

  return response.json();
}

export function useGoogleSuiteAuth({ enabled = true }: UseGoogleSuiteAuthOptions = {}) {
  const { data: status, isLoading, refetch } = useQuery({
    queryKey: queryKeys.googleSuiteAuthStatus,
    queryFn: fetchAuthStatus,
    enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: false,
  });

  return {
    status: status ?? null,
    isLoading,
    refetch,
  };
}
