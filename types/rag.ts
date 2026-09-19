import type { ProcessingStatus } from "@prisma/client";

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
  processingTimeoutMs?: number;
  queryVariants?: string[];
}

export interface RAGContextResult {
  context: string;
  documentCount: number;
  usedAttachmentIds: string[];
  citations?: Array<{
    id: string;
    source: string;
    relevance: string;
    score?: number;
    page?: number;
  }>;
}

export interface RerankDocument {
  content: string;
  score: number;
  metadata: {
    attachmentId: string;
    fileName: string;
    page?: number;
    chunkId?: string;
    charStart?: number;
  };
}

export interface RerankResult {
  content: string;
  score: number;
  metadata: {
    attachmentId: string;
    fileName: string;
    page?: number;
    chunkId?: string;
    charStart?: number;
  };
}
