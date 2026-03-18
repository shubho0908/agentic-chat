'use server';

import { prisma } from '@/lib/prisma';
import { loadDocument } from './loader';
import { isSupportedForRAG } from '../utils';
import { chunkDocuments, getOptimalChunkSize } from './chunker';
import { deleteDocumentChunks, addDocumentsToPgVector } from './store';
import { RAGError, RAGErrorCode, logRAGError } from '../common/errors';
import type { ProcessingStatus } from '@prisma/client';
import { safeFetch } from '@/lib/network/safeFetch';
import {
  logDocumentProcessingFinish,
  logDocumentProcessingStart,
  logError,
  measureLatencyMs,
} from '@/lib/observability';

interface ProcessDocumentResult {
  success: boolean;
  attachmentId: string;
  error?: string;
  stats?: {
    chunks: number;
    tokens: number;
  };
}

const MAX_DOCUMENT_DOWNLOAD_BYTES = 16 * 1024 * 1024;

async function downloadFile(fileUrl: string, mimeType?: string): Promise<Blob> {
  const response = await safeFetch(fileUrl, {
    timeoutMs: 15000,
    retries: 2,
    maxResponseBytes: MAX_DOCUMENT_DOWNLOAD_BYTES,
  });
  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const contentType = mimeType || response.headers.get('content-type') || 'application/octet-stream';
  return new Blob([arrayBuffer], { type: contentType });
}

export async function processDocument(
  attachmentId: string,
  userId: string
): Promise<ProcessDocumentResult> {
  const startedAt = Date.now();
  let canMutateAttachment = false;
  let fileType: string | undefined;
  let fileName: string | undefined;
  let conversationId: string | undefined;

  try {
    const attachment = await prisma.attachment.findUnique({
      where: { id: attachmentId },
      include: {
        message: {
          select: {
            conversationId: true,
            conversation: {
              select: {
                userId: true,
              },
            },
          },
        },
      },
    });

    if (!attachment) {
      throw new RAGError('Attachment not found', RAGErrorCode.NOT_FOUND);
    }

    if (attachment.message.conversation.userId !== userId) {
      throw new RAGError('Unauthorized', RAGErrorCode.UNAUTHORIZED);
    }

    canMutateAttachment = true;
    conversationId = attachment.message.conversationId;
    fileType = attachment.fileType;
    fileName = attachment.fileName;

    logDocumentProcessingStart({
      attachmentId,
      userId,
      conversationId,
      fileType,
      fileName,
    });

    if (!isSupportedForRAG(attachment.fileType)) {
      await prisma.attachment.update({
        where: { id: attachmentId },
        data: {
          processingStatus: 'FAILED' as ProcessingStatus,
          processingError: `Unsupported file type: ${attachment.fileType}`,
        },
      });

      const error = `Unsupported file type for RAG: ${attachment.fileType}`;
      logDocumentProcessingFinish({
        attachmentId,
        userId,
        conversationId,
        fileType,
        fileName,
        latencyMs: measureLatencyMs(startedAt),
        error,
      });

      return {
        success: false,
        attachmentId,
        error,
      };
    }

    await prisma.attachment.update({
      where: { id: attachmentId },
      data: {
        processingStatus: 'PROCESSING' as ProcessingStatus,
      },
    });

    const fileBlob = await downloadFile(attachment.fileUrl, attachment.fileType);

    const loadResult = await loadDocument(fileBlob, attachment.fileType, attachment.fileName);
    
    if (!loadResult.success || !loadResult.documents) {
      throw new Error(loadResult.error || 'Failed to load document');
    }

    const chunkConfig = getOptimalChunkSize(attachment.fileSize, attachment.fileType);
    const chunkResult = await chunkDocuments(loadResult.documents, chunkConfig);
    
    if (!chunkResult.success || !chunkResult.chunks) {
      throw new Error(chunkResult.error || 'Failed to chunk document');
    }

    const langchainDocs = chunkResult.chunks.map(chunk => ({
      pageContent: chunk.content,
      metadata: chunk.metadata ?? {},
    }));
    
    await addDocumentsToPgVector(
      langchainDocs,
      attachmentId,
      userId,
      attachment.fileName,
      conversationId
    );

    await prisma.attachment.update({
      where: { id: attachmentId },
      data: {
        processingStatus: 'COMPLETED' as ProcessingStatus,
        processedAt: new Date(),
        processingError: null,
        chunkCount: chunkResult.stats?.totalChunks || 0,
        totalTokens: chunkResult.stats?.totalTokens || 0,
      },
    });

    logDocumentProcessingFinish({
      attachmentId,
      userId,
      conversationId,
      fileType,
      fileName,
      chunkCount: chunkResult.stats?.totalChunks || 0,
      tokenCount: chunkResult.stats?.totalTokens || 0,
      latencyMs: measureLatencyMs(startedAt),
    });

    return {
      success: true,
      attachmentId,
      stats: {
        chunks: chunkResult.stats?.totalChunks || 0,
        tokens: chunkResult.stats?.totalTokens || 0,
      },
    };
  } catch (error) {
    let errorMessage = 'Unknown error';
    if (error instanceof RAGError) {
      logRAGError(error, 'processDocument');
      errorMessage = error.message;
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }

    try {
      if (canMutateAttachment) {
        await prisma.attachment.updateMany({
          where: { id: attachmentId },
          data: {
            processingStatus: 'FAILED' as ProcessingStatus,
            processingError: errorMessage,
          },
        });
      }
    } catch (statusUpdateError) {
      logError({
        event: 'document_processing_failure_status_persist_failed',
        attachmentId,
        userId,
        error: statusUpdateError instanceof Error ? statusUpdateError.message : String(statusUpdateError),
      });
    }

    try {
      if (canMutateAttachment) {
        await deleteDocumentChunks(attachmentId);
      }
    } catch (cleanupError) {
      logError({
        event: 'document_processing_cleanup_failed',
        attachmentId,
        userId,
        error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
      });
    }

    logDocumentProcessingFinish({
      attachmentId,
      userId,
      conversationId,
      fileType,
      fileName,
      latencyMs: measureLatencyMs(startedAt),
      error: errorMessage,
    });

    return {
      success: false,
      attachmentId,
      error: errorMessage,
    };
  }
}
