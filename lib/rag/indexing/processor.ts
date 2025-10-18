'use server';

import { prisma } from '@/lib/prisma';
import { loadDocument } from './loader';
import { isSupportedForRAG } from '../utils';
import { chunkDocuments, getOptimalChunkSize } from './chunker';
import { deleteDocumentChunks, addDocumentsToPgVector } from './store';
import { getAuthorizedAttachment } from '../auth/attachment';
import { RAGError, RAGErrorCode, logRAGError } from '../common/errors';
import type { ProcessingStatus } from '@prisma/client';

interface ProcessDocumentResult {
  success: boolean;
  attachmentId: string;
  error?: string;
  stats?: {
    chunks: number;
    tokens: number;
  };
}

async function downloadFile(fileUrl: string, mimeType?: string): Promise<Blob> {
  const response = await fetch(fileUrl);
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

    const conversationId = attachment.message.conversationId;

    if (!isSupportedForRAG(attachment.fileType)) {
      await prisma.attachment.update({
        where: { id: attachmentId },
        data: {
          processingStatus: 'FAILED' as ProcessingStatus,
          processingError: `Unsupported file type: ${attachment.fileType}`,
        },
      });

      return {
        success: false,
        attachmentId,
        error: `Unsupported file type for RAG: ${attachment.fileType}`,
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

    await prisma.attachment.update({
      where: { id: attachmentId },
      data: {
        processingStatus: 'FAILED' as ProcessingStatus,
        processingError: errorMessage,
      },
    });

    try {
      await deleteDocumentChunks(attachmentId);
    } catch {
      // Cleanup failed, but document is already marked as failed
    }

    return {
      success: false,
      attachmentId,
      error: errorMessage,
    };
  }
}

export async function reprocessDocument(
  attachmentId: string,
  userId: string
): Promise<ProcessDocumentResult> {
  try {
    await deleteDocumentChunks(attachmentId);

    await prisma.attachment.update({
      where: { id: attachmentId },
      data: {
        processingStatus: 'PENDING' as ProcessingStatus,
        processedAt: null,
        processingError: null,
        chunkCount: null,
        totalTokens: null,
      },
    });

    return await processDocument(attachmentId, userId);
  } catch (error) {
    throw new Error(`Error reprocessing document: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function deleteDocument(
  attachmentId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await getAuthorizedAttachment(attachmentId, userId);

    await deleteDocumentChunks(attachmentId);

    return { success: true };
  } catch (error) {
    if (error instanceof RAGError) {
      logRAGError(error, 'deleteDocument');
      return { success: false, error: error.message };
    }
    
    throw new Error(`Error deleting document: ${error instanceof Error ? error.message : String(error)}`);
  }
}
