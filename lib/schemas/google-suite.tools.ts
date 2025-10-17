import { z } from 'zod';

export enum GmailOperation {
  LIST_MESSAGES = 'list_messages',
  READ_MESSAGE = 'read_message',
  SEARCH = 'search',
  SEND_EMAIL = 'send_email',
  MARK_AS_READ = 'mark_as_read',
  MARK_AS_UNREAD = 'mark_as_unread',
  TRASH_MESSAGE = 'trash_message',
  DELETE_MESSAGE = 'delete_message',
  LIST_LABELS = 'list_labels',
  CREATE_LABEL = 'create_label',
  ADD_LABEL = 'add_label',
  REMOVE_LABEL = 'remove_label',
  LIST_DRAFTS = 'list_drafts',
}

export const gmailOperationSchema = z.discriminatedUnion('operation', [
  z.object({
    operation: z.literal(GmailOperation.LIST_MESSAGES),
    count: z.number().min(1).max(50).optional().default(10).describe('Number of messages to retrieve (1-50)'),
    query: z.string().optional().describe('Gmail search query (e.g., "is:unread from:example@gmail.com")'),
    labelIds: z.array(z.string()).optional().describe('Filter by label IDs (e.g., ["INBOX", "UNREAD"])'),
  }),
  
  z.object({
    operation: z.literal(GmailOperation.READ_MESSAGE),
    messageId: z.string().describe('The ID of the message to read'),
  }),
  
  z.object({
    operation: z.literal(GmailOperation.SEARCH),
    query: z.string().describe('Gmail search query (supports Gmail search operators like "from:", "subject:", "after:", etc.)'),
    maxResults: z.number().min(1).max(50).optional().default(10).describe('Maximum number of results (1-50)'),
  }),
  
  z.object({
    operation: z.literal(GmailOperation.SEND_EMAIL),
    to: z.union([z.string().email(), z.array(z.string().email())]).describe('Recipient email address(es)'),
    subject: z.string().describe('Email subject'),
    body: z.string().describe('Email body content'),
    cc: z.union([z.string().email(), z.array(z.string().email())]).optional().describe('CC recipients'),
    bcc: z.union([z.string().email(), z.array(z.string().email())]).optional().describe('BCC recipients'),
  }),
  
  z.object({
    operation: z.literal(GmailOperation.MARK_AS_READ),
    messageId: z.string().describe('The ID of the message to mark as read'),
  }),
  
  z.object({
    operation: z.literal(GmailOperation.MARK_AS_UNREAD),
    messageId: z.string().describe('The ID of the message to mark as unread'),
  }),
  
  z.object({
    operation: z.literal(GmailOperation.TRASH_MESSAGE),
    messageId: z.string().describe('The ID of the message to move to trash'),
  }),
  
  z.object({
    operation: z.literal(GmailOperation.DELETE_MESSAGE),
    messageId: z.string().describe('The ID of the message to permanently delete'),
  }),
  
  z.object({
    operation: z.literal(GmailOperation.LIST_LABELS),
  }),
  
  z.object({
    operation: z.literal(GmailOperation.CREATE_LABEL),
    name: z.string().describe('Name of the new label'),
  }),
  
  z.object({
    operation: z.literal(GmailOperation.ADD_LABEL),
    messageId: z.string().describe('The ID of the message'),
    labelIds: z.array(z.string()).describe('Label IDs to add to the message'),
  }),
  
  z.object({
    operation: z.literal(GmailOperation.REMOVE_LABEL),
    messageId: z.string().describe('The ID of the message'),
    labelIds: z.array(z.string()).describe('Label IDs to remove from the message'),
  }),
  
  z.object({
    operation: z.literal(GmailOperation.LIST_DRAFTS),
    count: z.number().min(1).max(50).optional().default(10).describe('Number of drafts to retrieve (1-50)'),
  }),
]);

export type GmailOperationInput = z.infer<typeof gmailOperationSchema>;
