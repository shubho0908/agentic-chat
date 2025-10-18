import type { gmail_v1 } from 'googleapis';
import { formatEmailDate } from '@/utils/dateFormatter';

export interface ParsedEmailContent {
  from: string;
  to: string;
  subject: string;
  date: string;
  snippet: string;
  body: string;
  labels: string[];
}

export function parseEmailContent(message: gmail_v1.Schema$Message): ParsedEmailContent {
  const headers = message.payload?.headers || [];
  const getHeader = (name: string): string => 
    headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || '';

  let body = '';
  
  const getBody = (part: gmail_v1.Schema$MessagePart): string => {
    if (part.body?.data) {
      return Buffer.from(part.body.data, 'base64url').toString('utf-8');
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
