export const GOOGLE_SCOPES = {
  // Core sign-in scopes
  OPENID: 'openid',
  USERINFO_EMAIL: 'https://www.googleapis.com/auth/userinfo.email',
  USERINFO_PROFILE: 'https://www.googleapis.com/auth/userinfo.profile',
  
  // Gmail scopes
  GMAIL_READONLY: 'https://www.googleapis.com/auth/gmail.readonly',
  GMAIL_SEND: 'https://www.googleapis.com/auth/gmail.send',
  GMAIL_MODIFY: 'https://www.googleapis.com/auth/gmail.modify',
  GMAIL_LABELS: 'https://www.googleapis.com/auth/gmail.labels',
  
  // Google Drive scopes
  DRIVE: 'https://www.googleapis.com/auth/drive',
  
  // Google Calendar scopes
  CALENDAR: 'https://www.googleapis.com/auth/calendar',
  
  // Google Docs scopes
  DOCS: 'https://www.googleapis.com/auth/documents',
  
  // Google Sheets scopes
  SHEETS: 'https://www.googleapis.com/auth/spreadsheets',

  // Google Slides scopes
  SLIDES: 'https://www.googleapis.com/auth/presentations',
} as const;

export const SCOPE_GROUPS = {
  SIGN_IN: [
    GOOGLE_SCOPES.OPENID,
    GOOGLE_SCOPES.USERINFO_EMAIL,
    GOOGLE_SCOPES.USERINFO_PROFILE,
  ],
  WORKSPACE: [
    GOOGLE_SCOPES.GMAIL_READONLY,
    GOOGLE_SCOPES.GMAIL_SEND,
    GOOGLE_SCOPES.GMAIL_MODIFY,
    GOOGLE_SCOPES.GMAIL_LABELS,
    GOOGLE_SCOPES.DRIVE,
    GOOGLE_SCOPES.CALENDAR,
    GOOGLE_SCOPES.DOCS,
    GOOGLE_SCOPES.SHEETS,
    GOOGLE_SCOPES.SLIDES,
  ],
} as const;

export const GOOGLE_SIGN_IN_SCOPES = [...SCOPE_GROUPS.SIGN_IN];

export const GOOGLE_WORKSPACE_SCOPES = [
  ...SCOPE_GROUPS.SIGN_IN,
  ...SCOPE_GROUPS.WORKSPACE,
];

export const ALL_GOOGLE_SUITE_SCOPES = [...GOOGLE_WORKSPACE_SCOPES];

export function getGrantedGoogleScopes(scope?: string | null): Set<string> {
  if (!scope) {
    return new Set();
  }

  return new Set(scope.split(/\s+/).map((value) => value.trim()).filter(Boolean));
}

export function getMissingGoogleWorkspaceScopes(scope?: string | null): string[] {
  const grantedScopes = getGrantedGoogleScopes(scope);
  return GOOGLE_WORKSPACE_SCOPES.filter((requiredScope) => !grantedScopes.has(requiredScope));
}

export function hasGoogleWorkspaceScopes(scope?: string | null): boolean {
  return getMissingGoogleWorkspaceScopes(scope).length === 0;
}

// Better Auth uses 'google' as the provider ID for Google OAuth
export const GOOGLE_PROVIDER_ID = 'google';
