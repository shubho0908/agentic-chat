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
import type { RAGContextOptions, RAGContextResult } from '@/types/rag';
import { withTrace } from '@/lib/langsmith-config';

export async function getRAGContext(
  query: string,
  userId: string,
  options: RAGContextOptions = {}
): Promise<RAGContextResult | null> {
  return withTrace(
    'rag-context-retrieval',
    async () => {
      try {
    const {
      conversationId,
      attachmentIds: providedAttachmentIds,
      limit = RAG_CONFIG.search.defaultLimit,
      scoreThreshold = RAG_CONFIG.search.scoreThreshold,
      waitForProcessing = true,
    } = options;

    let attachmentIds = providedAttachmentIds;

    if (conversationId && !attachmentIds) {
      const messages = await prisma.message.findMany({
        where: {
          conversationId,
          isDeleted: false,
        },
        select: {
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
        const newlyCompleted = await waitForDocumentProcessing(processingIds);
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
        const newlyCompleted = await waitForDocumentProcessing(needProcessing);
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

    const adjustedLimit = Math.max(limit, Math.min(completedAttachmentIds.length * 3, 15));

    const results = await searchDocumentChunks(query, userId, {
      limit: adjustedLimit,
      scoreThreshold,
      conversationId,
      attachmentIds: completedAttachmentIds,
    });

    if (results.length === 0) {
      return null;
    }

    const usedAttachmentIds = Array.from(
      new Set(results.map((r: { metadata: { attachmentId: string } }) => r.metadata.attachmentId))
    );

    const context = results
      .map((result: { content: string; metadata: { fileName: string; page?: number; attachmentId: string } }, index: number) => {
        const source = result.metadata.fileName;
        const page = result.metadata.page ? ` (Page ${result.metadata.page})` : '';
        return `[Document ${index + 1}: ${source}${page}]\n${result.content}`;
      })
      .join('\n\n---\n\n');

        return {
          context: `\n\nRelevant document context:\n${context}`,
          documentCount: usedAttachmentIds.length,
          usedAttachmentIds,
        };
      } catch {
        return null;
      }
    },
    {
      userId,
      conversationId: options.conversationId,
      queryLength: query.length,
      limit: options.limit ?? RAG_CONFIG.search.defaultLimit,
      scoreThreshold: options.scoreThreshold ?? RAG_CONFIG.search.scoreThreshold,
      waitForProcessing: options.waitForProcessing,
      providedAttachmentCount: options.attachmentIds?.length || 0,
    }
  );
}
