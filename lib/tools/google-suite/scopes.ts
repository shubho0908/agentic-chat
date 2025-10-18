export const GOOGLE_SCOPES = {
  // Core userinfo scopes (always required)
  USERINFO_EMAIL: 'https://www.googleapis.com/auth/userinfo.email',
  USERINFO_PROFILE: 'https://www.googleapis.com/auth/userinfo.profile',
  
  // Gmail scopes
  GMAIL_READONLY: 'https://www.googleapis.com/auth/gmail.readonly',
  GMAIL_SEND: 'https://www.googleapis.com/auth/gmail.send',
  GMAIL_MODIFY: 'https://www.googleapis.com/auth/gmail.modify',
  GMAIL_LABELS: 'https://www.googleapis.com/auth/gmail.labels',
  
  // Google Drive scopes
  DRIVE: 'https://www.googleapis.com/auth/drive',
  DRIVE_FILE: 'https://www.googleapis.com/auth/drive.file',
  
  // Google Calendar scopes
  CALENDAR: 'https://www.googleapis.com/auth/calendar',
  CALENDAR_EVENTS: 'https://www.googleapis.com/auth/calendar.events',
  
  // Google Docs scopes
  DOCS: 'https://www.googleapis.com/auth/documents',
  
  // Google Sheets scopes
  SHEETS: 'https://www.googleapis.com/auth/spreadsheets',
} as const;

export const SCOPE_GROUPS = {
  WORKSPACE: [
    GOOGLE_SCOPES.USERINFO_EMAIL,
    GOOGLE_SCOPES.USERINFO_PROFILE,
    GOOGLE_SCOPES.GMAIL_READONLY,
    GOOGLE_SCOPES.GMAIL_SEND,
    GOOGLE_SCOPES.GMAIL_MODIFY,
    GOOGLE_SCOPES.GMAIL_LABELS,
    GOOGLE_SCOPES.DRIVE,
    GOOGLE_SCOPES.CALENDAR,
    GOOGLE_SCOPES.DOCS,
    GOOGLE_SCOPES.SHEETS,
  ],
} as const;

export const ALL_GOOGLE_SUITE_SCOPES = [
  ...SCOPE_GROUPS.WORKSPACE,
];

export const GOOGLE_SUITE_PROVIDER_ID = 'google-suite';
