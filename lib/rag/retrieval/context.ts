'use server';

import { searchDocumentChunks } from './search';
import { prisma } from '@/lib/prisma';
import { RAG_CONFIG } from '../config';
import {
  waitForDocumentProcessing,
  getCompletedAttachmentIds,
  getAttachmentStatuses,
} from './status';
import {
  partitionByStatus,
  extractIds,
  filterDocumentAttachments,
} from './status-helpers';

export interface RAGContextOptions {
  conversationId?: string;
  attachmentIds?: string[];
  limit?: number;
  scoreThreshold?: number;
  waitForProcessing?: boolean;
  maxWaitTime?: number;
}



export async function getRAGContext(
  query: string,
  userId: string,
  options: RAGContextOptions = {}
): Promise<string | null> {
  try {
    const {
      conversationId,
      attachmentIds: providedAttachmentIds,
      limit = RAG_CONFIG.search.defaultLimit,
      scoreThreshold = RAG_CONFIG.search.scoreThreshold,
      waitForProcessing = true,
      maxWaitTime = RAG_CONFIG.processing.maxWaitTime,
    } = options;

    let attachmentIds = providedAttachmentIds;

    if (conversationId && !attachmentIds) {
      const messages = await prisma.message.findMany({
        where: {
          conversationId,
          isDeleted: false,
        },
        include: {
          attachments: {
            select: {
              id: true,
              fileType: true,
              processingStatus: true,
            },
          },
        },
        orderBy: {
          createdAt: 'asc',
        },
      });

      const allAttachments = messages.flatMap(m => m.attachments);
      const documentAttachments = filterDocumentAttachments(allAttachments);
      const partitioned = partitionByStatus(documentAttachments);

      const completedIds = extractIds(partitioned.completed);
      const processingIds = extractIds([...partitioned.processing, ...partitioned.pending]);

      if (processingIds.length > 0 && waitForProcessing) {
        const newlyCompleted = await waitForDocumentProcessing(processingIds, { maxWaitMs: maxWaitTime });
        attachmentIds = [...completedIds, ...newlyCompleted];
      } else {
        attachmentIds = completedIds;
      }

      if (attachmentIds.length === 0) {
        return null;
      }
    }

    if (!attachmentIds || attachmentIds.length === 0) {
      return null;
    }

    let completedAttachmentIds = attachmentIds;
    
    if (waitForProcessing) {
      const statuses = await getAttachmentStatuses(attachmentIds);
      const partitioned = partitionByStatus(statuses);

      const needProcessing = extractIds([...partitioned.processing, ...partitioned.pending]);
      const alreadyCompleted = extractIds(partitioned.completed);

      if (needProcessing.length > 0) {
        console.log('[RAG Context] 🕐 Waiting for', needProcessing.length, 'documents to complete processing...');
        const newlyCompleted = await waitForDocumentProcessing(needProcessing, { maxWaitMs: maxWaitTime });
        completedAttachmentIds = [...alreadyCompleted, ...newlyCompleted];
      } else {
        completedAttachmentIds = alreadyCompleted;
      }
    } else {
      completedAttachmentIds = await getCompletedAttachmentIds(attachmentIds);
    }

    if (completedAttachmentIds.length === 0) {
      return null;
    }

    const results = await searchDocumentChunks(query, userId, {
      limit,
      scoreThreshold,
      attachmentIds: completedAttachmentIds,
    });

    if (results.length === 0) {
      return null;
    }

    const context = results
      .map((result, index) => {
        const source = result.metadata.fileName;
        const page = result.metadata.page ? ` (Page ${result.metadata.page})` : '';
        return `[Document ${index + 1}: ${source}${page}]\n${result.content}`;
      })
      .join('\n\n---\n\n');

    return `\n\nRelevant document context:\n${context}`;
  } catch {
    return null;
  }
}
