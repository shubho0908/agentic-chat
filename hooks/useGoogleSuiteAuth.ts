import { useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { GoogleAuthorizationStatus } from '@/types/google-suite';

async function fetchAuthStatus(): Promise<GoogleAuthorizationStatus> {
  const response = await fetch('/api/google-suite/auth/status');
  
  if (!response.ok) {
    throw new Error('Failed to check authorization status');
  }

  return response.json();
}

export function useGoogleSuiteAuth() {
  const queryClient = useQueryClient();
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: status, isLoading, refetch } = useQuery({
    queryKey: ['google-suite-auth-status'],
    queryFn: fetchAuthStatus,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: false,
  });

  const authorize = useCallback(async () => {
    try {
      setIsAuthorizing(true);
      setError(null);
      
      const response = await fetch('/api/google-suite/auth/authorize');
      
      if (!response.ok) {
        throw new Error('Failed to get authorization URL');
      }

      const data = await response.json();
      
      if ('error' in data) {
        throw new Error(data.error);
      }

      if ('authUrl' in data) {
        window.location.href = data.authUrl;
      }
    } catch (err) {
      console.error('[Google Suite Auth] Authorization error:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      setIsAuthorizing(false);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const gsuiteAuth = params.get('gsuite_auth');
    
    if (gsuiteAuth === 'success') {
      window.history.replaceState({}, '', window.location.pathname);
      queryClient.invalidateQueries({ queryKey: ['google-suite-auth-status'] });
    } else if (gsuiteAuth === 'error') {
      const reason = params.get('reason') || 'unknown';
      const errorMessages: Record<string, string> = {
        account_mismatch: 'Please use the same Google account you signed in with',
        missing_params: 'Authorization request is invalid',
        no_access_token: 'Failed to obtain access token from Google',
        no_refresh_token: 'Failed to obtain refresh token - please revoke access in Google settings and try again',
        no_tokens: 'Failed to obtain access tokens',
        no_user_info: 'Failed to retrieve user information',
        processing_failed: 'An error occurred during authorization',
        access_denied: 'Authorization was denied',
        invalid_state: 'Invalid authorization state',
        missing_state: 'Authorization state expired or missing',
        state_mismatch: 'Authorization state mismatch - possible security issue',
        not_authenticated: 'Please sign in to authorize Google Suite',
        user_mismatch: 'User session mismatch - please try again',
        permissions_needed: 'Additional Google Workspace permissions required',
        insufficient_permissions: 'Not all required permissions were granted - please accept all requested permissions',
        token_invalid: 'Your Google authorization has expired or been revoked - please re-authorize',
      };
      setError(errorMessages[reason] || `Authorization failed: ${reason}`);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [queryClient]);

  return {
    status: status ?? null,
    isLoading,
    isAuthorizing,
    error,
    authorize,
    refetch,
  };
}
