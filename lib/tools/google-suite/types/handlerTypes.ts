export interface GmailSearchArgs {
  query: string;
  maxResults?: number;
}

export interface GmailReadArgs {
  messageId: string;
}

export interface GmailSendArgs {
  to: string;
  subject: string;
  body: string;
  cc?: string;
  bcc?: string;
}

export interface GmailReplyArgs {
  messageId: string;
  body: string;
  replyAll?: boolean;
}

export interface GmailDeleteArgs {
  messageIds: string[];
}

export interface GmailModifyArgs {
  messageIds: string[];
  addLabels?: string[];
  removeLabels?: string[];
}

export interface GmailGetAttachmentsArgs {
  messageId: string;
}

// Drive handler argument types
export interface DriveSearchArgs {
  query: string;
  maxResults?: number;
}

export interface DriveListFolderArgs {
  folderId?: string;
  folderName?: string;
  maxResults?: number;
}

export interface DriveReadFileArgs {
  fileId: string;
  mimeType?: string;
}

export interface DriveCreateFileArgs {
  name: string;
  content: string;
  mimeType?: string;
  folderId?: string;
}

export interface DriveCreateFolderArgs {
  name: string;
  parentFolderId?: string;
}

export interface DriveDeleteArgs {
  fileIds: string[];
}

export interface DriveMoveArgs {
  fileId: string;
  targetFolderId: string;
}

export interface DriveCopyArgs {
  fileId: string;
  newName?: string;
  targetFolderId?: string;
}

export interface DriveShareArgs {
  fileId: string;
  email?: string;
  role?: string;
  sendNotification?: boolean;
}

// Docs handler argument types
export interface DocsCreateArgs {
  title: string;
  content?: string;
}

export interface DocsReadArgs {
  documentId: string;
}

export interface DocsAppendArgs {
  documentId: string;
  text: string;
}

export interface DocsReplaceArgs {
  documentId: string;
  findText: string;
  replaceText: string;
}

// Calendar handler argument types
export interface CalendarListEventsArgs {
  calendarId?: string;
  timeMin?: string;
  timeMax?: string;
  maxResults?: number;
}

export interface CalendarCreateEventArgs {
  summary: string;
  startTime: string;
  endTime: string;
  description?: string;
  location?: string;
  attendees?: string[];
  timeZone?: string;
  calendarId?: string;
}

export interface CalendarUpdateEventArgs {
  eventId: string;
  summary?: string;
  startTime?: string;
  endTime?: string;
  description?: string;
  location?: string;
  calendarId?: string;
}

export interface CalendarDeleteEventArgs {
  eventId: string;
  calendarId?: string;
}

// Sheets handler argument types
export interface SheetsCreateArgs {
  title: string;
}

export interface SheetsReadArgs {
  spreadsheetId: string;
  range: string;
}

export interface SheetsWriteArgs {
  spreadsheetId: string;
  range: string;
  values: string[][];
}

export interface SheetsAppendArgs {
  spreadsheetId: string;
  range: string;
  values: string[][];
}

export interface SheetsClearArgs {
  spreadsheetId: string;
  range: string;
}

// Slides handler argument types
export interface SlidesCreateArgs {
  title: string;
}

export interface SlidesReadArgs {
  presentationId: string;
}

export interface SlidesAddSlideArgs {
  presentationId: string;
  title?: string;
  body?: string;
}

// Union type of all handler arguments
export type HandlerArgs =
  | GmailSearchArgs
  | GmailReadArgs
  | GmailSendArgs
  | GmailReplyArgs
  | GmailDeleteArgs
  | GmailModifyArgs
  | GmailGetAttachmentsArgs
  | DriveSearchArgs
  | DriveListFolderArgs
  | DriveReadFileArgs
  | DriveCreateFileArgs
  | DriveCreateFolderArgs
  | DriveDeleteArgs
  | DriveMoveArgs
  | DriveCopyArgs
  | DriveShareArgs
  | DocsCreateArgs
  | DocsReadArgs
  | DocsAppendArgs
  | DocsReplaceArgs
  | CalendarListEventsArgs
  | CalendarCreateEventArgs
  | CalendarUpdateEventArgs
  | CalendarDeleteEventArgs
  | SheetsCreateArgs
  | SheetsReadArgs
  | SheetsWriteArgs
  | SheetsAppendArgs
  | SheetsClearArgs
  | SlidesCreateArgs
  | SlidesReadArgs
  | SlidesAddSlideArgs;
