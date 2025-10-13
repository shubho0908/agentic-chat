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

export interface RAGContextOptions {
  conversationId?: string;
  attachmentIds?: string[];
  limit?: number;
  scoreThreshold?: number;
  waitForProcessing?: boolean;
}

export interface RAGContextResult {
  context: string;
  documentCount: number;
  usedAttachmentIds: string[];
}

export interface RerankDocument {
  content: string;
  score: number;
  metadata: {
    attachmentId: string;
    fileName: string;
    page?: number;
  };
}

export interface RerankResult {
  content: string;
  score: number;
  originalScore: number;
  metadata: {
    attachmentId: string;
    fileName: string;
    page?: number;
  };
}

export interface ContextRoutingResult {
  context: string;
  metadata: {
    hasMemories: boolean;
    hasDocuments: boolean;
    hasImages: boolean;
    memoryCount: number;
    documentCount: number;
    imageCount: number;
    routingDecision: string;
    skippedMemory: boolean;
    activeToolName?: string;
  };
}
