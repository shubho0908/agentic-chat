import type { ExportConversation, ExportMessage, ExportOptions } from '@/types/export';
import { MessageRole } from "@/lib/schemas/chat";
import { logger } from "@/lib/logger";
import {
  downloadTextFile,
  getConversationExportFileName,
} from '@/lib/export/downloadFile';

function exportToMarkdown(
  conversation: ExportConversation,
  options: ExportOptions = {}
): string {
  const {
    includeAttachments = true,
    includeVersions = false,
    includeMetadata = true,
  } = options;

  const lines: string[] = [];

  lines.push(`# ${conversation.title || 'Untitled Conversation'}\n`);

  if (includeMetadata) {
    lines.push('## Conversation Details\n');
    lines.push(`- **Created**: ${formatDate(conversation.createdAt)}`);
    lines.push(`- **Updated**: ${formatDate(conversation.updatedAt)}`);
    lines.push(`- **Exported**: ${formatDate(conversation.exportedAt)}`);
    if (conversation.user?.name) {
      lines.push(`- **User**: ${conversation.user.name}`);
    }
    lines.push('');
    lines.push('---\n');
  }

  lines.push('## Conversation\n');

  conversation.messages.forEach((message, index) => {
    lines.push(formatMessage(message, index + 1, includeAttachments, includeVersions));
  });

  return lines.join('\n');
}

function formatMessage(
  message: ExportMessage,
  index: number,
  includeAttachments: boolean,
  includeVersions: boolean
): string {
  const lines: string[] = [];
  const role = message.role === MessageRole.USER ? '👤 User' : '🤖 Assistant';
  
  lines.push(`### Message ${index}: ${role}`);
  lines.push(`*${formatDate(message.createdAt)}*\n`);
  
  lines.push(message.content);
  lines.push('');

  if (includeAttachments && message.attachments && message.attachments.length > 0) {
    lines.push('**Attachments:**\n');
    message.attachments.forEach((attachment) => {
      const sizeKB = (attachment.fileSize / 1024).toFixed(2);
      lines.push(`- 📎 [${attachment.fileName}](${attachment.fileUrl}) *(${sizeKB} KB, ${attachment.fileType})*`);
    });
    lines.push('');
  }

  if (includeVersions && message.versions && message.versions.length > 0) {
    lines.push(`<details>`);
    lines.push(`<summary>📝 Edit History (${message.versions.length} version${message.versions.length > 1 ? 's' : ''})</summary>\n`);
    message.versions.forEach((version, vIndex) => {
      lines.push(`#### Version ${vIndex + 1}`);
      lines.push(`*${formatDate(version.createdAt)}*\n`);
      lines.push(version.content);
      lines.push('');
    });
    lines.push('</details>\n');
  }

  lines.push('---\n');

  return lines.join('\n');
}

function formatDate(dateString: string | undefined | null): string {
  if (!dateString) {
    return 'Date unavailable';
  }
  
  const date = new Date(dateString);
  
  if (isNaN(date.getTime())) {
    logger.warn('Invalid date string:', dateString);
    return 'Invalid date';
  }
  
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export function downloadMarkdown(conversation: ExportConversation, options?: ExportOptions): void {
  const markdownContent = exportToMarkdown(conversation, options);
  const fileName = getConversationExportFileName(conversation.title, 'md');

  downloadTextFile(markdownContent, fileName, 'text/markdown;charset=utf-8');
}
