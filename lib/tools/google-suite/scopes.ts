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
  DRIVE_READONLY: 'https://www.googleapis.com/auth/drive.readonly',
  DRIVE: 'https://www.googleapis.com/auth/drive',
  
  // Google Calendar scopes
  CALENDAR_READONLY: 'https://www.googleapis.com/auth/calendar.readonly',
  CALENDAR: 'https://www.googleapis.com/auth/calendar',
  
  // Google Docs scopes
  DOCS_READONLY: 'https://www.googleapis.com/auth/documents.readonly',
  DOCS: 'https://www.googleapis.com/auth/documents',
  
  // Google Sheets scopes
  SHEETS_READONLY: 'https://www.googleapis.com/auth/spreadsheets.readonly',
  SHEETS: 'https://www.googleapis.com/auth/spreadsheets',

  // Google Slides scopes
  SLIDES_READONLY: 'https://www.googleapis.com/auth/presentations.readonly',
  SLIDES: 'https://www.googleapis.com/auth/presentations',
} as const;

const SCOPE_GROUPS = {
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
export const GOOGLE_CONNECTOR_SCOPES = [...SCOPE_GROUPS.SIGN_IN];

const GOOGLE_WORKSPACE_SCOPES = [
  ...SCOPE_GROUPS.SIGN_IN,
  ...SCOPE_GROUPS.WORKSPACE,
];

export const ALL_GOOGLE_SUITE_SCOPES = [...GOOGLE_WORKSPACE_SCOPES];

const IMPLIED_SCOPE_GRANTS: Record<string, string[]> = {
  [GOOGLE_SCOPES.GMAIL_READONLY]: [GOOGLE_SCOPES.GMAIL_MODIFY],
  [GOOGLE_SCOPES.DRIVE_READONLY]: [GOOGLE_SCOPES.DRIVE],
  [GOOGLE_SCOPES.CALENDAR_READONLY]: [GOOGLE_SCOPES.CALENDAR],
  [GOOGLE_SCOPES.DOCS_READONLY]: [GOOGLE_SCOPES.DOCS],
  [GOOGLE_SCOPES.SHEETS_READONLY]: [GOOGLE_SCOPES.SHEETS],
  [GOOGLE_SCOPES.SLIDES_READONLY]: [GOOGLE_SCOPES.SLIDES],
};

export function getGrantedGoogleScopes(scope?: string | null): Set<string> {
  if (!scope) {
    return new Set();
  }

  return new Set(scope.split(/[\s,]+/).map((value) => value.trim()).filter(Boolean));
}

function getGrantedGoogleWorkspaceScopes(scope?: string | null): string[] {
  const grantedScopes = getGrantedGoogleScopes(scope);

  return Array.from(grantedScopes).filter(
    (grantedScope) => !SCOPE_GROUPS.SIGN_IN.includes(grantedScope as (typeof SCOPE_GROUPS.SIGN_IN)[number])
  );
}

export function hasAnyGoogleWorkspaceScopes(scope?: string | null): boolean {
  return getGrantedGoogleWorkspaceScopes(scope).length > 0;
}

function hasGrantedGoogleScope(
  grantedScopes: Iterable<string>,
  requiredScope: string
): boolean {
  const grantedSet = grantedScopes instanceof Set ? grantedScopes : new Set(grantedScopes);

  if (grantedSet.has(requiredScope)) {
    return true;
  }

  return (IMPLIED_SCOPE_GRANTS[requiredScope] ?? []).some((scope) => grantedSet.has(scope));
}

export function getMissingGoogleScopes(
  requiredScopes: string[],
  grantedScopes: Iterable<string>
): string[] {
  return requiredScopes.filter((requiredScope) => !hasGrantedGoogleScope(grantedScopes, requiredScope));
}

export function getMissingGoogleWorkspaceScopes(scope?: string | null): string[] {
  const grantedScopes = getGrantedGoogleScopes(scope);
  return getMissingGoogleScopes(GOOGLE_WORKSPACE_SCOPES, grantedScopes);
}

function uniqueScopes(scopes: string[]): string[] {
  return Array.from(new Set(scopes));
}

function addDetectedGoogleWorkspaceScopes(text: string, scopes: string[]) {
  const hasGmail = /\b(gmail|email|emails|mail|inbox|message|messages|thread|threads)\b/.test(text);
  const hasDrive = /\b(drive|folder|folders|file|files|upload|download)\b|drive\.google\.com/.test(text);
  const hasCalendar = /\b(calendar|event|events|meeting|meetings|invite|invites|appointment|schedule|availability)\b/.test(text);
  const hasDocs = /\b(doc|docs|document|documents|writeup|proposal|brief|memo)\b|docs\.google\.com\/document/.test(text);
  const hasSheets = /\b(sheet|sheets|spreadsheet|spreadsheets|table|tables|rows|columns|cells|csv)\b|docs\.google\.com\/spreadsheets/.test(text);
  const hasSlides = /\b(slides|slide deck|deck|presentation|presentations)\b|docs\.google\.com\/presentation/.test(text);

  const wantsGmailSend = /\b(send|reply|draft|compose|forward)\b/.test(text) && hasGmail;
  const wantsGmailModify = /\b(archive|trash|delete|mark|star|label|read|unread)\b/.test(text) && hasGmail;
  const wantsDriveWrite = /\b(create|upload|move|rename|copy|share|organize|delete|trash)\b/.test(text) && hasDrive;
  const wantsCalendarWrite = /\b(create|schedule|reschedule|update|edit|cancel|delete)\b/.test(text) && hasCalendar;
  const wantsDocsWrite = /\b(create|write|draft|update|edit|append|insert|revise)\b/.test(text) && hasDocs;
  const wantsSheetsWrite = /\b(create|update|edit|append|clear|fill|write)\b/.test(text) && hasSheets;
  const wantsSlidesWrite = /\b(create|update|edit|draft|build)\b/.test(text) && hasSlides;

  if (hasGmail) {
    scopes.push(GOOGLE_SCOPES.GMAIL_READONLY);
  }
  if (wantsGmailSend) {
    scopes.push(GOOGLE_SCOPES.GMAIL_SEND);
  }
  if (wantsGmailModify) {
    scopes.push(GOOGLE_SCOPES.GMAIL_MODIFY, GOOGLE_SCOPES.GMAIL_LABELS);
  }

  if (hasDrive) {
    scopes.push(wantsDriveWrite ? GOOGLE_SCOPES.DRIVE : GOOGLE_SCOPES.DRIVE_READONLY);
  }

  if (hasCalendar) {
    scopes.push(wantsCalendarWrite ? GOOGLE_SCOPES.CALENDAR : GOOGLE_SCOPES.CALENDAR_READONLY);
  }

  if (hasDocs) {
    scopes.push(wantsDocsWrite ? GOOGLE_SCOPES.DOCS : GOOGLE_SCOPES.DOCS_READONLY);
  }

  if (hasSheets) {
    scopes.push(wantsSheetsWrite ? GOOGLE_SCOPES.SHEETS : GOOGLE_SCOPES.SHEETS_READONLY);
  }

  if (hasSlides) {
    scopes.push(wantsSlidesWrite ? GOOGLE_SCOPES.SLIDES : GOOGLE_SCOPES.SLIDES_READONLY);
  }
}

export function inferGoogleWorkspaceScopes(query: string): string[] {
  const text = query.toLowerCase();
  const scopes = [...GOOGLE_CONNECTOR_SCOPES];

  addDetectedGoogleWorkspaceScopes(text, scopes);

  if (scopes.length === GOOGLE_CONNECTOR_SCOPES.length) {
    return [...ALL_GOOGLE_SUITE_SCOPES];
  }

  return uniqueScopes(scopes);
}

// Better Auth uses 'google' as the provider ID for Google OAuth
export const GOOGLE_PROVIDER_ID = 'google';
