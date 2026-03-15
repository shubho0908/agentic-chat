import type { Attachment } from "@/lib/schemas/chat";
import { isSupportedDocumentExtension } from "./file-validation";

interface UploadFileResponse {
  url: string;
  name: string;
  size?: number;
  type?: string;
}

export type UploadAttachment = Attachment & {
  clientFileId?: string;
};

function uploadResponseToAttachment(
  uploadResult: UploadFileResponse,
  clientFileId?: string
): UploadAttachment {
  return {
    fileUrl: uploadResult.url,
    fileName: uploadResult.name,
    fileType: uploadResult.type || 'image/jpeg',
    fileSize: uploadResult.size || 0,
    clientFileId,
  };
}

export function uploadResponsesToAttachments(
  uploadResults: UploadFileResponse[],
  uploadMetadata: Array<{ clientFileId: string }> = []
): UploadAttachment[] {
  return uploadResults.map((uploadResult, index) =>
    uploadResponseToAttachment(uploadResult, uploadMetadata[index]?.clientFileId)
  );
}

export function filterImageAttachments(attachments?: Attachment[]): Attachment[] {
  if (!attachments || attachments.length === 0) {
    return [];
  }
  
  return attachments.filter(att => 
    att.fileName && !isSupportedDocumentExtension(att.fileName) && att.fileType.startsWith('image/')
  );
}

export function filterDocumentAttachments(attachments?: Attachment[]): Attachment[] {
  if (!attachments || attachments.length === 0) {
    return [];
  }
  
  return attachments.filter(att => 
    (att.fileName && isSupportedDocumentExtension(att.fileName)) || !att.fileType.startsWith('image/')
  );
}
