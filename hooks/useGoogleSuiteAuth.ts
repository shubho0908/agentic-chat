import { useQuery } from '@tanstack/react-query';
import type { GoogleAuthorizationStatus } from '@/types/google-suite';

async function fetchAuthStatus(): Promise<GoogleAuthorizationStatus> {
  const response = await fetch('/api/google-suite/auth/status');
  
  if (!response.ok) {
    throw new Error('Failed to check authorization status');
  }

  return response.json();
}

export function useGoogleSuiteAuth() {
  const { data: status, isLoading, refetch } = useQuery({
    queryKey: ['google-suite-auth-status'],
    queryFn: fetchAuthStatus,
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
