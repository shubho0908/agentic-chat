import { google } from 'googleapis';
import type { gmail_v1 } from 'googleapis';
import { formatEmailDate } from '@/utils/dateFormatter';
import { createGoogleSuiteClient } from './client';

export interface GmailClientContext {
  gmail: gmail_v1.Gmail;
  userId: string;
}

export async function createGmailClient(userId: string): Promise<GmailClientContext> {
  const { oauth2Client, userId: uid } = await createGoogleSuiteClient(userId);
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  return { gmail, userId: uid };
}

export async function listMessages(
  client: GmailClientContext,
  options: {
    maxResults?: number;
    query?: string;
    labelIds?: string[];
  }
): Promise<gmail_v1.Schema$Message[]> {
  const { maxResults = 10, query, labelIds } = options;

  const response = await client.gmail.users.messages.list({
    userId: 'me',
    maxResults: Math.min(maxResults, 100),
    q: query,
    labelIds: labelIds || ['INBOX'],
  });

  if (!response.data.messages || response.data.messages.length === 0) {
    return [];
  }

  const messageIds = response.data.messages.map(m => m.id!);
  const messages = await Promise.all(
    messageIds.map(id => getMessage(client, id))
  );

  return messages.filter(Boolean) as gmail_v1.Schema$Message[];
}

export async function getMessage(client: GmailClientContext, messageId: string): Promise<gmail_v1.Schema$Message | null> {
  try {
    const response = await client.gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full',
    });

    return response.data;
  } catch (error) {
    console.error(`[Gmail Client] Failed to get message ${messageId}:`, error);
    return null;
  }
}

export async function searchMessages(client: GmailClientContext, query: string, maxResults: number = 10): Promise<gmail_v1.Schema$Message[]> {
  return listMessages(client, { query, maxResults });
}

export async function sendMessage(
  client: GmailClientContext,
  options: {
    to: string | string[];
    subject: string;
    body: string;
    cc?: string | string[];
    bcc?: string | string[];
  }
): Promise<gmail_v1.Schema$Message> {
  const { to, subject, body, cc, bcc } = options;

  const toAddresses = Array.isArray(to) ? to.join(', ') : to;
  const ccAddresses = cc ? (Array.isArray(cc) ? cc.join(', ') : cc) : '';
  const bccAddresses = bcc ? (Array.isArray(bcc) ? bcc.join(', ') : bcc) : '';

  const messageParts = [
    `To: ${toAddresses}`,
    ccAddresses ? `Cc: ${ccAddresses}` : '',
    bccAddresses ? `Bcc: ${bccAddresses}` : '',
    `Subject: ${subject}`,
    '',
    body,
  ].filter(Boolean);

  const message = messageParts.join('\n');
  const encodedMessage = Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const response = await client.gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw: encodedMessage,
    },
  });

  return response.data;
}

export async function modifyMessage(
  client: GmailClientContext,
  messageId: string,
  options: {
    addLabelIds?: string[];
    removeLabelIds?: string[];
  }
): Promise<gmail_v1.Schema$Message> {
  const response = await client.gmail.users.messages.modify({
    userId: 'me',
    id: messageId,
    requestBody: options,
  });

  return response.data;
}

export async function markAsRead(client: GmailClientContext, messageId: string): Promise<gmail_v1.Schema$Message> {
  return modifyMessage(client, messageId, {
    removeLabelIds: ['UNREAD'],
  });
}

export async function markAsUnread(client: GmailClientContext, messageId: string): Promise<gmail_v1.Schema$Message> {
  return modifyMessage(client, messageId, {
    addLabelIds: ['UNREAD'],
  });
}

export async function trashMessage(client: GmailClientContext, messageId: string): Promise<gmail_v1.Schema$Message> {
  const response = await client.gmail.users.messages.trash({
    userId: 'me',
    id: messageId,
  });

  return response.data;
}

export async function deleteMessage(client: GmailClientContext, messageId: string): Promise<void> {
  await client.gmail.users.messages.delete({
    userId: 'me',
    id: messageId,
  });
}

export async function listLabels(client: GmailClientContext): Promise<gmail_v1.Schema$Label[]> {
  const response = await client.gmail.users.labels.list({
    userId: 'me',
  });

  return response.data.labels || [];
}

export async function createLabel(client: GmailClientContext, name: string): Promise<gmail_v1.Schema$Label> {
  const response = await client.gmail.users.labels.create({
    userId: 'me',
    requestBody: {
      name,
      labelListVisibility: 'labelShow',
      messageListVisibility: 'show',
    },
  });

  return response.data;
}

export async function deleteLabel(client: GmailClientContext, labelId: string): Promise<void> {
  await client.gmail.users.labels.delete({
    userId: 'me',
    id: labelId,
  });
}

export async function listDrafts(client: GmailClientContext, maxResults: number = 10): Promise<gmail_v1.Schema$Draft[]> {
  const response = await client.gmail.users.drafts.list({
    userId: 'me',
    maxResults: Math.min(maxResults, 100),
  });

  if (!response.data.drafts || response.data.drafts.length === 0) {
    return [];
  }

  const draftIds = response.data.drafts.map(d => d.id!);
  const drafts = await Promise.all(
    draftIds.map(id => getDraft(client, id))
  );

  return drafts.filter(Boolean) as gmail_v1.Schema$Draft[];
}

export async function getDraft(client: GmailClientContext, draftId: string): Promise<gmail_v1.Schema$Draft | null> {
  try {
    const response = await client.gmail.users.drafts.get({
      userId: 'me',
      id: draftId,
      format: 'full',
    });

    return response.data;
  } catch (error) {
    console.error(`[Gmail Client] Failed to get draft ${draftId}:`, error);
    return null;
  }
}

export function parseEmailContent(message: gmail_v1.Schema$Message): ParsedEmailContent {
  const headers = message.payload?.headers || [];
  const getHeader = (name: string): string => 
    headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || '';

  let body = '';
  
  const getBody = (part: gmail_v1.Schema$MessagePart): string => {
    if (part.body?.data) {
      return Buffer.from(part.body.data, 'base64').toString('utf-8');
    }
    
    if (part.parts) {
      for (const subPart of part.parts) {
        const content = getBody(subPart);
        if (content) return content;
      }
    }
    
    return '';
  };

  if (message.payload) {
    body = getBody(message.payload);
  }

  const rawDate = getHeader('Date');
  
  return {
    from: getHeader('From'),
    to: getHeader('To'),
    subject: getHeader('Subject'),
    date: formatEmailDate(rawDate),
    snippet: message.snippet || '',
    body: body || message.snippet || '',
    labels: message.labelIds || [],
  };
}

export interface ParsedEmailContent {
  from: string;
  to: string;
  subject: string;
  date: string;
  snippet: string;
  body: string;
  labels: string[];
}
