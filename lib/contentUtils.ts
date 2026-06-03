import type { MessageContentPart, Attachment } from "@/lib/schemas/chat";
import { filterImageAttachments } from "@/lib/attachmentUtils";

export function extractTextFromContent(content: string | MessageContentPart[]): string {
  if (typeof content === 'string') {
    return content;
  }
  
  if (Array.isArray(content)) {
    return content
      .filter((part): part is { type: 'text'; text: string } => 
        part.type === 'text' && 'text' in part
      )
      .map(part => part.text)
      .join(' ');
  }
  
  return '';
}

export function buildMultimodalContent(
  text: string, 
  attachments?: Attachment[]
): string | MessageContentPart[] {
  if (!attachments || attachments.length === 0) {
    return text;
  }
  
  const imageAttachments = filterImageAttachments(attachments);
  
  if (imageAttachments.length === 0) {
    return text;
  }
  
  const urlReferences = imageAttachments
    .map(att => `- ${att.fileName}: ${att.fileUrl}`)
    .join('\n');
  
  const metadataBlock = `<system_metadata>\nAttached images are available for code/artifact generation:\n${urlReferences}\n</system_metadata>`;
  const contextualText = text.trim() ? `${metadataBlock}\n\n${text}` : metadataBlock;
  
  return [
    { type: "text" as const, text: contextualText },
    ...imageAttachments.map(att => ({
      type: "image_url" as const,
      image_url: { url: att.fileUrl },
    }))
  ];
}

export function generateTitle(content: string | MessageContentPart[], maxLength = 50): string {
  const textContent = extractTextFromContent(content);
  const cleaned = textContent.trim().replace(/\n/g, ' ');
  
  if (cleaned.length <= maxLength) {
    return cleaned;
  }
  
  return cleaned.substring(0, maxLength).trim() + '...';
}
