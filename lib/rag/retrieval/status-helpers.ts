import type { ProcessingStatus } from '@/lib/generated/prisma';

export interface AttachmentStatus {
  id: string;
  processingStatus: ProcessingStatus;
  processingError?: string | null;
}

export interface PartitionedAttachments<T extends AttachmentStatus> {
  completed: T[];
  processing: T[];
  failed: T[];
  pending: T[];
}

export function partitionByStatus<T extends AttachmentStatus>(
  attachments: T[]
): PartitionedAttachments<T> {
  return {
    completed: attachments.filter(a => a.processingStatus === 'COMPLETED'),
    processing: attachments.filter(a => a.processingStatus === 'PROCESSING'),
    pending: attachments.filter(a => a.processingStatus === 'PENDING'),
    failed: attachments.filter(a => a.processingStatus === 'FAILED'),
  };
}

export function extractIds<T extends { id: string }>(items: T[]): string[] {
  return items.map(item => item.id);
}

export function isDocumentAttachment(fileType: string): boolean {
  return !fileType.startsWith('image/');
}

export function filterDocumentAttachments<T extends { fileType: string }>(
  attachments: T[]
): T[] {
  return attachments.filter(a => isDocumentAttachment(a.fileType));
}
