export interface GoogleAuthorizationStatus {
  authorized: boolean;
  needsRefresh?: boolean;
  expiresAt?: string | null;
  reason?: 'no_google_account' | 'permissions_needed' | 'no_tokens' | 'missing_scopes' | 'insufficient_permissions' | 'token_invalid';
  message?: string;
  missingScopes?: string[];
}

export interface GoogleAuthorizationUrl {
  authUrl: string;
}

export enum GoogleAuthCallbackStatus {
  SUCCESS = 'success',
  ERROR = 'error',
}

export interface GoogleAuthCallbackError {
  gsuite_auth: GoogleAuthCallbackStatus.ERROR;
  reason: 
    | 'access_denied'
    | 'missing_params'
    | 'no_access_token'
    | 'no_refresh_token'
    | 'no_tokens'
    | 'no_user_info'
    | 'account_mismatch'
    | 'processing_failed'
    | 'invalid_state'
    | 'missing_state'
    | 'state_mismatch'
    | 'not_authenticated'
    | 'user_mismatch';
}

export interface GoogleAuthCallbackSuccess {
  gsuite_auth: GoogleAuthCallbackStatus.SUCCESS;
}
