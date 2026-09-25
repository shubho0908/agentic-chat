import { attachmentKind } from "@/lib/chat/attachmentKind";
import type { AttachmentStatus, PartitionedAttachments } from "@/types/rag";

export function partitionByStatus<T extends AttachmentStatus>(
  attachments: T[],
): PartitionedAttachments<T> {
  return {
    completed: attachments.filter((a) => a.processingStatus === "COMPLETED"),
    processing: attachments.filter((a) => a.processingStatus === "PROCESSING"),
    pending: attachments.filter((a) => a.processingStatus === "PENDING"),
    failed: attachments.filter((a) => a.processingStatus === "FAILED"),
  };
}

export function extractIds<T extends { id: string }>(items: T[]): string[] {
  return items.map((item) => item.id);
}

function isDocumentAttachment(fileType: string): boolean {
  return (
    fileType.startsWith("text/") ||
    fileType === "application/json" ||
    fileType === "application/xml" ||
    fileType === "application/pdf" ||
    fileType.includes("wordprocessingml") ||
    fileType.includes("spreadsheetml") ||
    fileType.includes("msword") ||
    fileType.includes("ms-excel") ||
    fileType.includes("officedocument")
  );
}

export function filterDocumentAttachments<
  T extends { fileType: string; kind?: string | null },
>(attachments: T[], kind: "document" | "snippet" = "document"): T[] {
  return attachments.filter(
    (a) => attachmentKind(a) === kind && isDocumentAttachment(a.fileType),
  );
}
