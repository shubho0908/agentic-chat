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

export function formatFileSize(bytes?: string | null): string {
  if (!bytes) return 'N/A';
  const size = parseInt(bytes);
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function formatMimeType(mimeType?: string | null): string {
  if (!mimeType) return 'Unknown';
  if (mimeType === 'application/vnd.google-apps.folder') return '📁 Folder';
  if (mimeType === 'application/vnd.google-apps.document') return '📄 Google Doc';
  if (mimeType === 'application/vnd.google-apps.spreadsheet') return '📊 Google Sheet';
  if (mimeType === 'application/vnd.google-apps.presentation') return '📽️ Google Slides';
  if (mimeType === 'application/pdf') return '📕 PDF';
  if (mimeType.startsWith('image/')) return '🖼️ Image';
  if (mimeType.startsWith('video/')) return '🎥 Video';
  if (mimeType.startsWith('audio/')) return '🎵 Audio';
  return '📎 File';
}

export function formatDate(dateStr?: string | null): string {
  if (!dateStr) return 'Unknown';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}
