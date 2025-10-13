import type { Attachment } from "@/types/core";

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

/**
 * Filter image attachments from all attachments.
 */
export function filterImageAttachments(attachments?: Attachment[]): Attachment[] {
  if (!attachments || attachments.length === 0) {
    return [];
  }
  
  return attachments.filter(att => att.fileType.startsWith('image/'));
}

export function filterDocumentAttachments(attachments?: Attachment[]): Attachment[] {
  if (!attachments || attachments.length === 0) {
    return [];
  }
  
  return attachments.filter(att => !att.fileType.startsWith('image/'));
}
