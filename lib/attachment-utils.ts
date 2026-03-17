import type { Attachment } from "@/lib/schemas/chat";
import { isSupportedDocumentExtension } from "./file-validation";

interface UploadFileResponse {
  url: string;
  name: string;
  size?: number;
  type?: string;
  serverData?: {
    type?: string;
  };
}

export type UploadAttachment = Attachment & {
  clientFileId?: string;
};

function inferMimeTypeFromFileName(fileName: string): string {
  const lowerName = fileName.toLowerCase();

  if (lowerName.endsWith(".pdf")) return "application/pdf";
  if (lowerName.endsWith(".txt")) return "text/plain";
  if (lowerName.endsWith(".csv")) return "text/csv";
  if (lowerName.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (lowerName.endsWith(".doc")) return "application/msword";
  if (lowerName.endsWith(".xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (lowerName.endsWith(".xls")) return "application/vnd.ms-excel";
  if (lowerName.endsWith(".png")) return "image/png";
  if (lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg")) return "image/jpeg";
  if (lowerName.endsWith(".gif")) return "image/gif";
  if (lowerName.endsWith(".webp")) return "image/webp";
  if (lowerName.endsWith(".bmp")) return "image/bmp";
  if (lowerName.endsWith(".svg")) return "image/svg+xml";
  if (lowerName.endsWith(".tif") || lowerName.endsWith(".tiff")) return "image/tiff";
  if (lowerName.endsWith(".ico")) return "image/x-icon";

  return "application/octet-stream";
}

function uploadResponseToAttachment(
  uploadResult: UploadFileResponse,
  clientFileId?: string
): UploadAttachment {
  const resolvedType =
    uploadResult.type ||
    uploadResult.serverData?.type ||
    inferMimeTypeFromFileName(uploadResult.name);

  return {
    fileUrl: uploadResult.url,
    fileName: uploadResult.name,
    fileType: resolvedType,
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
