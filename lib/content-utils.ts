import type { MessageContentPart, Attachment } from "@/types/core";
import { filterImageAttachments } from "@/lib/attachment-utils";

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

export function isMultimodalContent(content: unknown): content is MessageContentPart[] {
  return Array.isArray(content) && content.length > 0 && 
    content.every(part => 
      typeof part === 'object' && 
      part !== null && 
      'type' in part
    );
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
  
  return [
    { type: "text" as const, text },
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
