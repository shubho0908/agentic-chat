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
import { getPgPool } from '../storage/pgvector-client';

interface ResolvedAttachmentScope {
  attachmentIds: string[];
  attachmentCount: number;
}

function formatRetrievedContext(
  results: Array<{ content: string; metadata: { fileName: string; page?: number; attachmentId: string } }>
): RAGContextResult {
  const usedAttachmentIds = Array.from(
    new Set(results.map((result) => result.metadata.attachmentId))
  );

  const context = results
    .map((result, index) => {
      const source = result.metadata.fileName;
      const page = result.metadata.page ? ` (Page ${result.metadata.page})` : '';
      return `[Document ${index + 1}: ${source}${page}]\n${result.content}`;
    })
    .join('\n\n---\n\n');

  return {
    context:
      `\n\nUse the following retrieved document evidence before answering.` +
      `\n<retrieved_documents>\n${context}\n</retrieved_documents>`,
    documentCount: usedAttachmentIds.length,
    usedAttachmentIds,
  };
}

async function resolveCompletedAttachmentScope(
  options: RAGContextOptions = {}
): Promise<ResolvedAttachmentScope | null> {
  const {
    conversationId,
    attachmentIds: providedAttachmentIds,
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

    const allAttachments = messages.flatMap((message) => message.attachments);
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

  return {
    attachmentIds: completedAttachmentIds,
    attachmentCount: completedAttachmentIds.length,
  };
}

export async function getDocumentOverviewContext(
  userId: string,
  options: RAGContextOptions = {}
): Promise<RAGContextResult | null> {
  return withTrace(
    'rag-document-overview',
    async () => {
      try {
        const scope = await resolveCompletedAttachmentScope(options);
        if (!scope) {
          return null;
        }

        const pool = getPgPool();
        const result = await pool.query<{
          content: string;
          attachment_id: string;
          file_name: string;
          page: number | null;
          created_at: string;
        }>(
          `SELECT
             content,
             metadata->>'attachmentId' AS attachment_id,
             metadata->>'fileName' AS file_name,
             NULLIF(metadata->>'page', '')::int AS page,
             created_at::text AS created_at
           FROM document_chunk
           WHERE metadata->>'userId' = $1
             AND ($2::text IS NULL OR metadata->>'conversationId' = $2)
             AND metadata->>'attachmentId' = ANY($3::text[])
           ORDER BY created_at ASC
           LIMIT 40`,
          [userId, options.conversationId ?? null, scope.attachmentIds]
        );

        if (result.rows.length === 0) {
          return null;
        }

        const perAttachmentBudget = 2;
        const chunksByAttachment = new Map<string, number>();
        const selected = result.rows.filter((row) => {
          const currentCount = chunksByAttachment.get(row.attachment_id) ?? 0;
          if (currentCount >= perAttachmentBudget) {
            return false;
          }
          chunksByAttachment.set(row.attachment_id, currentCount + 1);
          return true;
        });

        if (selected.length === 0) {
          return null;
        }

        const formatted = selected.map((row) => ({
          content: row.content,
          metadata: {
            attachmentId: row.attachment_id,
            fileName: row.file_name,
            page: row.page ?? undefined,
          },
        }));

        const overviewContext = formatRetrievedContext(formatted);
        return {
          ...overviewContext,
          documentCount: scope.attachmentCount,
        };
      } catch {
        return null;
      }
    },
    {
      userId,
      conversationId: options.conversationId,
      providedAttachmentCount: options.attachmentIds?.length || 0,
    }
  );
}

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
      limit = RAG_CONFIG.search.defaultLimit,
      scoreThreshold = RAG_CONFIG.search.scoreThreshold,
    } = options;

    const scope = await resolveCompletedAttachmentScope(options);
    if (!scope) {
      return null;
    }

    const adjustedLimit = Math.max(limit, Math.min(scope.attachmentIds.length * 3, 15));

    const results = await searchDocumentChunks(query, userId, {
      limit: adjustedLimit,
      scoreThreshold,
      conversationId,
      attachmentIds: scope.attachmentIds,
    });

    if (results.length === 0) {
      return null;
    }

        return formatRetrievedContext(results);
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
