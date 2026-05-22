import { STRING_ENUM } from "@/constants/stringEnums";

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
  if (mimeType === STRING_ENUM.APPLICATION_VND_GOOGLE_APPS_FOLDER) return '📁 Folder';
  if (mimeType === STRING_ENUM.APPLICATION_VND_GOOGLE_APPS_DOCUMENT) return '📄 Google Doc';
  if (mimeType === STRING_ENUM.APPLICATION_VND_GOOGLE_APPS_SPREADSHEET) return '📊 Google Sheet';
  if (mimeType === STRING_ENUM.APPLICATION_VND_GOOGLE_APPS_PRESENTATION) return '📽️ Google Slides';
  if (mimeType === STRING_ENUM.APPLICATION_PDF) return '📕 PDF';
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
