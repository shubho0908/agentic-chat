import { STRING_ENUM } from "@/constants/stringEnums";
import type { AttachmentStatus, PartitionedAttachments } from '@/types/rag';

export function partitionByStatus<T extends AttachmentStatus>(
  attachments: T[]
): PartitionedAttachments<T> {
  return {
    completed: attachments.filter(a => a.processingStatus === STRING_ENUM.COMPLETED_434F4D50),
    processing: attachments.filter(a => a.processingStatus === STRING_ENUM.PROCESSING),
    pending: attachments.filter(a => a.processingStatus === STRING_ENUM.PENDING_50454E44),
    failed: attachments.filter(a => a.processingStatus === STRING_ENUM.FAILED_4641494C),
  };
}

export function extractIds<T extends { id: string }>(items: T[]): string[] {
  return items.map(item => item.id);
}

function isDocumentAttachment(fileType: string): boolean {
  return fileType.startsWith('text/') || 
    fileType === STRING_ENUM.APPLICATION_PDF ||
    fileType.includes('wordprocessingml') ||
    fileType.includes('spreadsheetml') ||
    fileType.includes('msword') ||
    fileType.includes('ms-excel') ||
    fileType.includes('officedocument');
}

export function filterDocumentAttachments<T extends { fileType: string }>(
  attachments: T[]
): T[] {
  return attachments.filter(a => isDocumentAttachment(a.fileType));
}
