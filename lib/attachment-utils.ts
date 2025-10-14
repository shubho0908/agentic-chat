import type { Attachment } from "@/types/core";
import { SUPPORTED_DOCUMENT_EXTENSIONS } from "@/constants/upload";

interface UploadFileResponse {
  url: string;
  name: string;
  size?: number;
  type?: string;
}

function uploadResponseToAttachment(uploadResult: UploadFileResponse): Attachment {
  return {
    fileUrl: uploadResult.url,
    fileName: uploadResult.name,
    fileType: uploadResult.type || 'image/jpeg',
    fileSize: uploadResult.size || 0,
  };
}

/**
 * Transform multiple upload responses to Attachment array.
 */
export function uploadResponsesToAttachments(uploadResults: UploadFileResponse[]): Attachment[] {
  return uploadResults.map(uploadResponseToAttachment);
}

function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1) return '';
  return filename.slice(lastDot).toLowerCase();
}

function isDocumentByExtension(filename: string): boolean {
  const ext = getFileExtension(filename);
  return (SUPPORTED_DOCUMENT_EXTENSIONS as readonly string[]).includes(ext);
}

/**
 * Filter image attachments from all attachments.
 */
export function filterImageAttachments(attachments?: Attachment[]): Attachment[] {
  if (!attachments || attachments.length === 0) {
    return [];
  }
  
  return attachments.filter(att => 
    !isDocumentByExtension(att.fileName) && att.fileType.startsWith('image/')
  );
}

export function filterDocumentAttachments(attachments?: Attachment[]): Attachment[] {
  if (!attachments || attachments.length === 0) {
    return [];
  }
  
  return attachments.filter(att => 
    isDocumentByExtension(att.fileName) || !att.fileType.startsWith('image/')
  );
}
