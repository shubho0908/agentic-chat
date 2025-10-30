export interface GoogleAuthorizationStatus {
  authorized: boolean;
  needsRefresh?: boolean;
  expiresAt?: string | null;
  reason?: 'no_google_account' | 'permissions_needed' | 'no_tokens' | 'token_invalid';
  message?: string;
  missingScopes?: string[];
}

export interface GoogleWorkspaceProgressCallback {
  (progress: {
    status: string;
    message: string;
    details?: Record<string, unknown>;
  }): void;
}
