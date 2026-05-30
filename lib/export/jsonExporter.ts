import type { ExportConversation, ExportOptions } from '@/types/export';
import {
  downloadTextFile,
  getConversationExportFileName,
} from '@/lib/export/downloadFile';

function exportToJSON(
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
  const fileName = getConversationExportFileName(conversation.title, 'json');

  downloadTextFile(jsonContent, fileName, 'application/json;charset=utf-8');
}
