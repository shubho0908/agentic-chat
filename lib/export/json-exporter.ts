import type { ExportConversation, ExportOptions } from '@/types/export';

export function exportToJSON(
  conversation: ExportConversation,
  options: ExportOptions = {}
): string {
  const {
    includeAttachments = true,
    includeVersions = true,
    includeMetadata = true,
  } = options;

  const exportData: ExportConversation = {
    ...conversation,
    messages: conversation.messages.map((message) => ({
      ...message,
      attachments: includeAttachments ? message.attachments : undefined,
      versions: includeVersions ? message.versions : undefined,
    })),
  };

  if (!includeMetadata) {
    delete exportData.user;
  }

  return JSON.stringify(exportData, null, 2);
}

export function downloadJSON(conversation: ExportConversation, options?: ExportOptions): void {
  const jsonContent = exportToJSON(conversation, options);
  const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const fileName = `${sanitizeFileName(conversation.title || 'conversation')}_${new Date().toISOString().split('T')[0]}.json`;
  
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 100);
}

function sanitizeFileName(name: string): string {
  const sanitized = name
    .replace(/[^a-z0-9]/gi, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
    .slice(0, 50)
    .replace(/_+$/g, '');
  
  return sanitized || 'conversation';
}
