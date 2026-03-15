export interface GoogleAuthorizationStatus {
  authorized: boolean;
  connected?: boolean;
  workspaceConnected?: boolean;
  oauthConsentReady?: boolean;
  oauthConsentMessage?: string;
  configuredScopes?: string[];
  needsRefresh?: boolean;
  expiresAt?: string | null;
  reason?: 'no_google_account' | 'permissions_needed' | 'no_tokens' | 'token_invalid';
  message?: string;
  missingScopes?: string[];
  grantedScopes?: string[];
}

export interface GoogleWorkspaceProgressCallback {
  (progress: {
    status: string;
    message: string;
    details?: Record<string, unknown>;
  }): void;
}
