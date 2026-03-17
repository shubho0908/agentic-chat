import { z } from 'zod';
import type { HandlerArgs } from '@/lib/tools/google-suite/types/handler-types';

const nonEmptyString = z.string().trim().min(1);
const optionalNonEmptyString = nonEmptyString.optional();
const nonEmptyStringArray = z.array(nonEmptyString).min(1);
const emailString = z.string().trim().email();
const booleanDefaultTrue = z.boolean().default(true);
const booleanDefaultFalse = z.boolean().default(false);

export const GOOGLE_TOOL_SCHEMAS = {
  gmail_search: z.object({
    query: nonEmptyString,
    maxResults: z.number().int().min(1).max(50).optional(),
  }).strict(),
  gmail_read: z.object({
    messageId: nonEmptyString,
  }).strict(),
  gmail_send: z.object({
    to: emailString,
    subject: nonEmptyString,
    body: nonEmptyString,
    cc: emailString.optional(),
    bcc: emailString.optional(),
  }).strict(),
  gmail_reply: z.object({
    messageId: nonEmptyString,
    body: nonEmptyString,
    replyAll: booleanDefaultFalse.optional(),
  }).strict(),
  gmail_delete: z.object({
    messageIds: nonEmptyStringArray,
  }).strict(),
  gmail_modify: z.object({
    messageIds: nonEmptyStringArray,
    addLabels: nonEmptyStringArray.optional(),
    removeLabels: nonEmptyStringArray.optional(),
  }).strict(),
  gmail_get_attachments: z.object({
    messageId: nonEmptyString,
  }).strict(),
  drive_search: z.object({
    query: nonEmptyString,
    maxResults: z.number().int().min(1).max(50).optional(),
  }).strict(),
  drive_list_folder: z.object({
    folderId: optionalNonEmptyString,
    folderName: optionalNonEmptyString,
    maxResults: z.number().int().min(1).max(100).optional(),
  }).strict().refine(
    (value) => Boolean(value.folderId || value.folderName),
    'Either folderId or folderName is required'
  ),
  drive_read_file: z.object({
    fileId: nonEmptyString,
    mimeType: optionalNonEmptyString,
  }).strict(),
  drive_create_file: z.object({
    name: nonEmptyString,
    content: z.string(),
    mimeType: optionalNonEmptyString,
    folderId: optionalNonEmptyString,
  }).strict(),
  drive_create_folder: z.object({
    name: nonEmptyString,
    parentFolderId: optionalNonEmptyString,
  }).strict(),
  drive_delete: z.object({
    fileIds: nonEmptyStringArray,
  }).strict(),
  drive_move: z.object({
    fileId: nonEmptyString,
    targetFolderId: nonEmptyString,
  }).strict(),
  drive_copy: z.object({
    fileId: nonEmptyString,
    newName: optionalNonEmptyString,
    targetFolderId: optionalNonEmptyString,
  }).strict(),
  drive_share: z.object({
    fileId: nonEmptyString,
    email: emailString.optional(),
    role: z.enum(['reader', 'writer', 'commenter']).optional(),
    sendNotification: booleanDefaultTrue.optional(),
  }).strict(),
  docs_create: z.object({
    title: nonEmptyString,
    content: z.string().optional(),
  }).strict(),
  docs_read: z.object({
    documentId: nonEmptyString,
  }).strict(),
  docs_append: z.object({
    documentId: nonEmptyString,
    text: nonEmptyString,
  }).strict(),
  docs_replace: z.object({
    documentId: nonEmptyString,
    findText: nonEmptyString,
    replaceText: nonEmptyString,
  }).strict(),
  calendar_list_events: z.object({
    calendarId: optionalNonEmptyString,
    timeMin: optionalNonEmptyString,
    timeMax: optionalNonEmptyString,
    maxResults: z.number().int().min(1).max(50).optional(),
  }).strict(),
  calendar_create_event: z.object({
    summary: nonEmptyString,
    startTime: nonEmptyString,
    endTime: nonEmptyString,
    description: optionalNonEmptyString,
    location: optionalNonEmptyString,
    attendees: z.array(emailString).optional(),
    timeZone: optionalNonEmptyString,
    calendarId: optionalNonEmptyString,
  }).strict(),
  calendar_update_event: z.object({
    eventId: nonEmptyString,
    summary: optionalNonEmptyString,
    startTime: optionalNonEmptyString,
    endTime: optionalNonEmptyString,
    description: optionalNonEmptyString,
    location: optionalNonEmptyString,
    calendarId: optionalNonEmptyString,
  }).strict(),
  calendar_delete_event: z.object({
    eventId: nonEmptyString,
    calendarId: optionalNonEmptyString,
  }).strict(),
  sheets_create: z.object({
    title: nonEmptyString,
  }).strict(),
  sheets_read: z.object({
    spreadsheetId: nonEmptyString,
    range: nonEmptyString,
  }).strict(),
  sheets_write: z.object({
    spreadsheetId: nonEmptyString,
    range: nonEmptyString,
    values: z.array(z.array(nonEmptyString).min(1)).min(1),
  }).strict(),
  sheets_append: z.object({
    spreadsheetId: nonEmptyString,
    range: nonEmptyString,
    values: z.array(z.array(nonEmptyString).min(1)).min(1),
  }).strict(),
  sheets_clear: z.object({
    spreadsheetId: nonEmptyString,
    range: nonEmptyString,
  }).strict(),
  slides_create: z.object({
    title: nonEmptyString,
  }).strict(),
  slides_read: z.object({
    presentationId: nonEmptyString,
  }).strict(),
  slides_add_slide: z.object({
    presentationId: nonEmptyString,
    title: optionalNonEmptyString,
    body: optionalNonEmptyString,
  }).strict(),
} satisfies Record<string, z.ZodType<HandlerArgs>>;

export function validateGoogleToolArgs(
  toolName: string,
  args: unknown
): HandlerArgs {
  const schema = GOOGLE_TOOL_SCHEMAS[toolName as keyof typeof GOOGLE_TOOL_SCHEMAS];

  if (!schema) {
    throw new Error(`Unknown Google Workspace tool: ${toolName}`);
  }

  return schema.parse(args) as HandlerArgs;
}
