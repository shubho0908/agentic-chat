import { useState, useEffect, useCallback } from 'react';
import type { GoogleAuthorizationStatus } from '@/types/google-suite';

export function useGoogleSuiteAuth() {
  const [status, setStatus] = useState<GoogleAuthorizationStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkStatus = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetch('/api/google-suite/auth/status');
      
      if (!response.ok) {
        throw new Error('Failed to check authorization status');
      }

      const data: GoogleAuthorizationStatus = await response.json();
      setStatus(data);
    } catch (err) {
      console.error('[Google Suite Auth] Status check error:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      setStatus(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

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
    checkStatus();

    const params = new URLSearchParams(window.location.search);
    const gsuiteAuth = params.get('gsuite_auth');
    
    if (gsuiteAuth === 'success') {
      window.history.replaceState({}, '', window.location.pathname);
      checkStatus();
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
  }, [checkStatus]);

  return {
    status,
    isLoading,
    isAuthorizing,
    error,
    authorize,
    refetch: checkStatus,
  };
}
