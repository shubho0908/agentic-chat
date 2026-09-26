import { attachmentKind } from "@/lib/chat/attachmentKind";
import type { Attachment } from "@/lib/schemas/chat";
import { isSupportedDocumentExtension } from "./fileValidation";

interface UploadFileResponse {
  /** Preferred file URL (uploadthing v9 canonical field). */
  ufsUrl?: string;
  /** @deprecated Removed in uploadthing v9; kept only as a fallback. */
  url?: string;
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
  if (lowerName.endsWith(".docx"))
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (lowerName.endsWith(".doc")) return "application/msword";
  if (lowerName.endsWith(".xlsx"))
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (lowerName.endsWith(".xls")) return "application/vnd.ms-excel";
  if (lowerName.endsWith(".png")) return "image/png";
  if (lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg"))
    return "image/jpeg";
  if (lowerName.endsWith(".gif")) return "image/gif";
  if (lowerName.endsWith(".webp")) return "image/webp";
  if (lowerName.endsWith(".bmp")) return "image/bmp";
  if (lowerName.endsWith(".svg")) return "image/svg+xml";
  if (lowerName.endsWith(".tif") || lowerName.endsWith(".tiff"))
    return "image/tiff";
  if (lowerName.endsWith(".ico")) return "image/x-icon";

  return "application/octet-stream";
}

function uploadResponseToAttachment(
  uploadResult: UploadFileResponse,
  clientFileId?: string,
): UploadAttachment {
  const reportedType = uploadResult.type || uploadResult.serverData?.type;
  const inferredType = inferMimeTypeFromFileName(uploadResult.name);
  const resolvedType =
    !reportedType || reportedType.toLowerCase() === "application/octet-stream"
      ? inferredType
      : reportedType;

  return {
    // Prefer ufsUrl (v9 canonical); fall back to legacy url for old payloads.
    // These are plain data fields (no deprecation getters), so the fallback
    // read is warning-free.
    fileUrl: uploadResult.ufsUrl || uploadResult.url || "",
    fileName: uploadResult.name,
    fileType: resolvedType,
    fileSize: uploadResult.size || 0,
    clientFileId,
  };
}

export function uploadResponsesToAttachments(
  uploadResults: UploadFileResponse[],
  uploadMetadata: Array<{ clientFileId: string }> = [],
): UploadAttachment[] {
  return uploadResults.map((uploadResult, index) =>
    uploadResponseToAttachment(
      uploadResult,
      uploadMetadata[index]?.clientFileId,
    ),
  );
}

export function filterImageAttachments(
  attachments?: Attachment[],
): Attachment[] {
  if (!attachments || attachments.length === 0) {
    return [];
  }

  return attachments.filter(
    (att) =>
      att.fileName &&
      !isSupportedDocumentExtension(att.fileName) &&
      attachmentKind(att) === "image" &&
      att.fileType.startsWith("image/"),
  );
}

export function filterDocumentAttachments(
  attachments?: Attachment[],
): Attachment[] {
  if (!attachments || attachments.length === 0) {
    return [];
  }

  return attachments.filter((att) => attachmentKind(att) === "document");
}
