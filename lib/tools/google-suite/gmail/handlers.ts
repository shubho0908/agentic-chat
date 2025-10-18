import { google, type gmail_v1 } from 'googleapis';
import type { ToolHandlerContext } from '../types';
import { parseEmailContent } from '../utils';

export async function handleGmailSearch(
  context: ToolHandlerContext,
  args: { query: string; maxResults?: number }
): Promise<string> {
  const gmail = google.gmail({ version: 'v1', auth: context.oauth2Client });
  
  const response = await gmail.users.messages.list({
    userId: 'me',
    q: args.query,
    maxResults: args.maxResults || 10,
  });

  if (!response.data.messages || response.data.messages.length === 0) {
    return `No messages found for query: "${args.query}"`;
  }

  const messages = await Promise.all(
    response.data.messages.map(async (msg) => {
      const fullMsg = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id!,
        format: 'full',
      });
      return fullMsg.data;
    })
  );

  const formatted = messages.map((msg, idx) => {
    const content = parseEmailContent(msg);
    return `${idx + 1}. **From:** ${content.from}
   **Subject:** ${content.subject}
   **Date:** ${content.date}
   **Snippet:** ${content.snippet}
   **Message ID:** ${msg.id}`;
  });

  return `Found ${messages.length} message(s):\n\n${formatted.join('\n\n')}`;
}

export async function handleGmailRead(
  context: ToolHandlerContext,
  args: { messageId: string }
): Promise<string> {
  const gmail = google.gmail({ version: 'v1', auth: context.oauth2Client });
  
  const response = await gmail.users.messages.get({
    userId: 'me',
    id: args.messageId,
    format: 'full',
  });

  const content = parseEmailContent(response.data);
  
  return `**Email Details:**

**From:** ${content.from}
**To:** ${content.to}
**Subject:** ${content.subject}
**Date:** ${content.date}
**Labels:** ${content.labels.join(', ')}

**Body:**
${content.body}`;
}

export async function handleGmailSend(
  context: ToolHandlerContext,
  args: { to: string; subject: string; body: string; cc?: string; bcc?: string }
): Promise<string> {
  const gmail = google.gmail({ version: 'v1', auth: context.oauth2Client });
  
  const messageParts = [
    `To: ${args.to}`,
    args.cc ? `Cc: ${args.cc}` : '',
    args.bcc ? `Bcc: ${args.bcc}` : '',
    `Subject: ${args.subject}`,
    '',
    args.body,
  ].filter(Boolean);

  const message = messageParts.join('\n');
  const encodedMessage = Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const response = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: encodedMessage },
  });

  return `Email sent successfully! Message ID: ${response.data.id}`;
}

export async function handleGmailReply(
  context: ToolHandlerContext,
  args: { messageId: string; body: string; replyAll?: boolean }
): Promise<string> {
  const gmail = google.gmail({ version: 'v1', auth: context.oauth2Client });
  
  const original = await gmail.users.messages.get({
    userId: 'me',
    id: args.messageId,
    format: 'full',
  });

  const headers = original.data.payload?.headers || [];
  const getHeader = (name: string): string => 
    headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || '';

  const to = args.replyAll ? getHeader('To') : getHeader('From');
  const cc = args.replyAll ? getHeader('Cc') : '';
  const subject = getHeader('Subject').startsWith('Re:') 
    ? getHeader('Subject') 
    : `Re: ${getHeader('Subject')}`;
  const threadId = original.data.threadId;
  const messageId = getHeader('Message-ID');
  const references = getHeader('References') || getHeader('In-Reply-To') || messageId;

  const messageParts = [
    `To: ${to}`,
    cc ? `Cc: ${cc}` : '',
    `Subject: ${subject}`,
    `In-Reply-To: ${messageId}`,
    `References: ${references}`,
    '',
    args.body,
  ].filter(Boolean);

  const message = messageParts.join('\n');
  const encodedMessage = Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const response = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { 
      raw: encodedMessage,
      threadId,
    },
  });

  return `Reply sent successfully! Message ID: ${response.data.id}`;
}

export async function handleGmailDelete(
  context: ToolHandlerContext,
  args: { messageIds: string[] }
): Promise<string> {
  const gmail = google.gmail({ version: 'v1', auth: context.oauth2Client });
  
  await Promise.all(
    args.messageIds.map(id => 
      gmail.users.messages.trash({ userId: 'me', id })
    )
  );

  return `Successfully moved ${args.messageIds.length} message(s) to trash.`;
}

export async function handleGmailModify(
  context: ToolHandlerContext,
  args: { messageIds: string[]; addLabels?: string[]; removeLabels?: string[] }
): Promise<string> {
  const gmail = google.gmail({ version: 'v1', auth: context.oauth2Client });
  
  const labelsResponse = await gmail.users.labels.list({ userId: 'me' });
  const allLabels = labelsResponse.data.labels || [];
  
  const labelMap = new Map<string, string>();
  allLabels.forEach(label => {
    if (label.name && label.id) {
      labelMap.set(label.name.toLowerCase(), label.id);
      labelMap.set(label.id.toLowerCase(), label.id); // Allow ID passthrough
    }
  });
  
  const translateLabels = (labels: string[] | undefined): string[] => {
    if (!labels || labels.length === 0) return [];
    
    const translatedIds: string[] = [];
    const notFound: string[] = [];
    
    labels.forEach(label => {
      const labelId = labelMap.get(label.toLowerCase());
      if (labelId) {
        translatedIds.push(labelId);
      } else {
        notFound.push(label);
      }
    });
    
    if (notFound.length > 0) {
      console.warn(`[Gmail] Labels not found and will be skipped: ${notFound.join(', ')}`);
    }
    
    return translatedIds;
  };
  
  const addLabelIds = translateLabels(args.addLabels);
  const removeLabelIds = translateLabels(args.removeLabels);
  
  await Promise.all(
    args.messageIds.map(id => 
      gmail.users.messages.modify({
        userId: 'me',
        id,
        requestBody: {
          addLabelIds: addLabelIds.length > 0 ? addLabelIds : undefined,
          removeLabelIds: removeLabelIds.length > 0 ? removeLabelIds : undefined,
        },
      })
    )
  );

  let message = `Successfully modified ${args.messageIds.length} message(s).`;
  if (args.addLabels?.length) {
    message += `\nAdded labels: ${args.addLabels.join(', ')}`;
  }
  if (args.removeLabels?.length) {
    message += `\nRemoved labels: ${args.removeLabels.join(', ')}`;
  }

  return message;
}

export async function handleGmailGetAttachments(
  context: ToolHandlerContext,
  args: { messageId: string }
): Promise<string> {
  const gmail = google.gmail({ version: 'v1', auth: context.oauth2Client });
  
  const response = await gmail.users.messages.get({
    userId: 'me',
    id: args.messageId,
    format: 'full',
  });

  const attachments: Array<{ filename: string; mimeType: string; size: number }> = [];

  const getParts = (parts?: gmail_v1.Schema$MessagePart[]): void => {
    if (!parts) return;
    
    for (const part of parts) {
      if (part.filename && part.body?.attachmentId) {
        attachments.push({
          filename: part.filename,
          mimeType: part.mimeType || 'unknown',
          size: part.body.size || 0,
        });
      }
      
      if (part.parts) {
        getParts(part.parts);
      }
    }
  };

  if (response.data.payload) {
    getParts(response.data.payload.parts || [response.data.payload]);
  }

  if (attachments.length === 0) {
    return 'No attachments found in this email.';
  }

  const formatted = attachments.map((att, idx) => 
    `${idx + 1}. **${att.filename}**\n   Type: ${att.mimeType}\n   Size: ${(att.size / 1024).toFixed(2)} KB`
  );

  return `Found ${attachments.length} attachment(s):\n\n${formatted.join('\n\n')}`;
}
