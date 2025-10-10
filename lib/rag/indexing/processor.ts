'use server';

import { prisma } from '@/lib/prisma';
import { loadDocument, isSupportedForRAG } from './loader';
import { chunkDocuments, getOptimalChunkSize } from './chunker';
import { deleteDocumentChunks } from './store';
import { getAuthorizedAttachment } from '../auth/attachment';
import { RAGError, logRAGError } from '../common/errors';
import type { ProcessingStatus } from '@/lib/generated/prisma';

export interface ProcessDocumentResult {
  success: boolean;
  attachmentId: string;
  error?: string;
  stats?: {
    chunks: number;
    tokens: number;
  };
}

export async function downloadFile(fileUrl: string): Promise<string> {
  const fs = await import('fs/promises');
  const path = await import('path');
  const os = await import('os');

  const tmpDir = os.tmpdir();
  const fileName = fileUrl.split('/').pop() || 'temp-file';
  const filePath = path.join(tmpDir, `${Date.now()}-${fileName}`);

  const response = await fetch(fileUrl);
  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.statusText}`);
  }

  const buffer = await response.arrayBuffer();
  await fs.writeFile(filePath, Buffer.from(buffer));

  return filePath;
}

export async function cleanupFile(filePath: string): Promise<void> {
  const fs = await import('fs/promises');
  await fs.unlink(filePath);
}

export async function processDocument(
  attachmentId: string,
  userId: string
): Promise<ProcessDocumentResult> {
  let tempFilePath: string | null = null;

  try {
    const attachment = await getAuthorizedAttachment(attachmentId, userId);

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

    tempFilePath = await downloadFile(attachment.fileUrl);

    const loadResult = await loadDocument(tempFilePath, attachment.fileType);
    
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
      metadata: chunk.metadata,
    }));

    const { addDocumentsToPgVector } = await import('./store');
    await addDocumentsToPgVector(
      langchainDocs,
      attachmentId,
      userId,
      attachment.fileName
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

    if (tempFilePath) {
      await cleanupFile(tempFilePath);
    }

    return {
      success: true,
      attachmentId,
      stats: {
        chunks: chunkResult.stats?.totalChunks || 0,
        tokens: chunkResult.stats?.totalTokens || 0,
      },
    };
  } catch (error) {
    if (tempFilePath) {
      await cleanupFile(tempFilePath);
    }

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
