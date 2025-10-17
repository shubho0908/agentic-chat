export const GOOGLE_SCOPES = {
  // Core userinfo scopes (always required)
  USERINFO_EMAIL: 'https://www.googleapis.com/auth/userinfo.email',
  USERINFO_PROFILE: 'https://www.googleapis.com/auth/userinfo.profile',
  
  // Gmail scopes
  GMAIL_READONLY: 'https://www.googleapis.com/auth/gmail.readonly',
  GMAIL_SEND: 'https://www.googleapis.com/auth/gmail.send',
  GMAIL_MODIFY: 'https://www.googleapis.com/auth/gmail.modify',
  GMAIL_LABELS: 'https://www.googleapis.com/auth/gmail.labels',
  
  // Future: Google Drive scopes
  // DRIVE_READONLY: 'https://www.googleapis.com/auth/drive.readonly',
  // DRIVE_FILE: 'https://www.googleapis.com/auth/drive.file',
  
  // Future: Google Calendar scopes
  // CALENDAR_READONLY: 'https://www.googleapis.com/auth/calendar.readonly',
  // CALENDAR_EVENTS: 'https://www.googleapis.com/auth/calendar.events',
  
  // Future: Google Docs scopes
  // DOCS_READONLY: 'https://www.googleapis.com/auth/documents.readonly',
} as const;

export const SCOPE_GROUPS = {
  GMAIL: [
    GOOGLE_SCOPES.USERINFO_EMAIL,
    GOOGLE_SCOPES.USERINFO_PROFILE,
    GOOGLE_SCOPES.GMAIL_READONLY,
    GOOGLE_SCOPES.GMAIL_SEND,
    GOOGLE_SCOPES.GMAIL_MODIFY,
    GOOGLE_SCOPES.GMAIL_LABELS,
  ],
  
  // Future: Add more tool groups here
  // DRIVE: [GOOGLE_SCOPES.USERINFO_EMAIL, GOOGLE_SCOPES.USERINFO_PROFILE, GOOGLE_SCOPES.DRIVE_READONLY],
  // CALENDAR: [GOOGLE_SCOPES.USERINFO_EMAIL, GOOGLE_SCOPES.USERINFO_PROFILE, GOOGLE_SCOPES.CALENDAR_READONLY],
} as const;

export const ALL_GOOGLE_SUITE_SCOPES = [
  ...SCOPE_GROUPS.GMAIL,
  // Future: Add more scope groups here
];

export const GOOGLE_SUITE_PROVIDER_ID = 'google-suite';
