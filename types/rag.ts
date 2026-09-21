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
  signal?: AbortSignal;
  /** True when the requesting flow can execute tools; gates on this path
   * fail closed instead of passing unscreened context through. */
  toolCapable?: boolean;
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

/** Where a retrieval score came from. Only bounded similarity ("semantic")
 * and reranker relevance ("rerank") values are honest to display as match
 * percentages; raw lexical ranks are ordering signals, not probabilities. */
export type RetrievalScoreOrigin = "semantic" | "lexical" | "rerank";

export interface RerankDocument {
  content: string;
  score: number;
  scoreOrigin?: RetrievalScoreOrigin;
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
  scoreOrigin?: RetrievalScoreOrigin;
  metadata: {
    attachmentId: string;
    fileName: string;
    page?: number;
    chunkId?: string;
    charStart?: number;
  };
}
