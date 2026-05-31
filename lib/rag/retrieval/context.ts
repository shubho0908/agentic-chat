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
} from './statusHelpers';
import type { RAGContextOptions, RAGContextResult } from '@/types/rag';
import { withTrace } from '@/lib/langsmithConfig';
import { runOrQueueDocumentProcessingJob } from '@/lib/orchestration/documentJobs';
import { logger } from '@/lib/logger';

interface ResolvedAttachmentScope {
  attachmentIds: string[];
  attachmentCount: number;
}

function selectOverviewRows<T>(rows: T[], maxPerAttachment: number): T[] {
  if (rows.length <= maxPerAttachment) {
    return rows;
  }

  const selectedIndexes = new Set<number>();
  selectedIndexes.add(0);
  selectedIndexes.add(rows.length - 1);
  selectedIndexes.add(Math.floor((rows.length - 1) / 2));

  const orderedIndexes = Array.from(selectedIndexes)
    .filter((index) => index >= 0 && index < rows.length)
    .sort((a, b) => a - b)
    .slice(0, maxPerAttachment);

  return orderedIndexes.map((index) => rows[index]);
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

  const seenSources = new Set<string>();
  const citations = results
    .map((result, index) => {
      const key = `${result.metadata.fileName}:${result.metadata.page ?? ''}`;
      if (seenSources.has(key)) return null;
      seenSources.add(key);
      return {
        id: `rag-${index}`,
        source: result.metadata.fileName,
        relevance: 'high',
        page: result.metadata.page,
      };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);

  return {
    context:
      `\n\nUse the following retrieved document evidence before answering.` +
      `\n<retrieved_documents>\n${context}\n</retrieved_documents>`,
    documentCount: usedAttachmentIds.length,
    usedAttachmentIds,
    citations,
  };
}

async function resolveCompletedAttachmentScope(
  userId: string,
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
        conversation: {
          userId,
        },
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
      for (const attachmentId of extractIds(partitioned.pending)) {
        void runOrQueueDocumentProcessingJob(attachmentId, userId).catch((error) => {
          logger.warn('[RAG] Failed to kick off pending document processing:', {
            attachmentId,
            error: error instanceof Error ? error.message : String(error),
          });
        });
      }

      const newlyCompleted = await waitForDocumentProcessing(processingIds, {
        timeoutMs: options.processingTimeoutMs,
        userId,
      });
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
    const statuses = await getAttachmentStatuses(attachmentIds, userId);
    const partitioned = partitionByStatus(statuses);

    const needProcessing = extractIds([...partitioned.processing, ...partitioned.pending]);
    const alreadyCompleted = extractIds(partitioned.completed);

    if (needProcessing.length > 0) {
      for (const attachmentId of extractIds(partitioned.pending)) {
        void runOrQueueDocumentProcessingJob(attachmentId, userId).catch((error) => {
          logger.warn('[RAG] Failed to kick off provided document processing:', {
            attachmentId,
            error: error instanceof Error ? error.message : String(error),
          });
        });
      }

      const newlyCompleted = await waitForDocumentProcessing(needProcessing, {
        timeoutMs: options.processingTimeoutMs,
        userId,
      });
      completedAttachmentIds = [...alreadyCompleted, ...newlyCompleted];
    } else {
      completedAttachmentIds = alreadyCompleted;
    }
  } else {
    completedAttachmentIds = await getCompletedAttachmentIds(attachmentIds, userId);
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
        const scope = await resolveCompletedAttachmentScope(userId, options);
        if (!scope) {
          return null;
        }

        const rows = await prisma.$queryRaw<Array<{
          content: string;
          attachment_id: string;
          file_name: string;
          page: number | null;
          created_at: string;
        }>>`
          SELECT
            content,
            metadata->>'attachmentId' AS attachment_id,
            metadata->>'fileName' AS file_name,
            CASE
              WHEN metadata->>'page' ~ '^[0-9]+$'
                THEN (metadata->>'page')::int
              ELSE NULL
            END AS page,
            created_at::text AS created_at
          FROM document_chunk
          WHERE metadata->>'userId' = ${userId}
            AND (${options.conversationId ?? null}::text IS NULL OR metadata->>'conversationId' = ${options.conversationId ?? null})
            AND metadata->>'attachmentId' = ANY(${scope.attachmentIds}::text[])
          ORDER BY created_at ASC
          LIMIT 120`;

        if (rows.length === 0) {
          return null;
        }

        const perAttachmentBudget = 3;
        const rowsByAttachment = new Map<string, typeof rows>();

        for (const row of rows) {
          const attachmentRows = rowsByAttachment.get(row.attachment_id) ?? [];
          attachmentRows.push(row);
          rowsByAttachment.set(row.attachment_id, attachmentRows);
        }

        const selected = Array.from(rowsByAttachment.values()).flatMap((attachmentRows) =>
          selectOverviewRows(attachmentRows, perAttachmentBudget)
        );

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
      } catch (error) {
        logger.error('[RAG] Document overview context retrieval failed:', error);
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

async function enrichWithNeighborChunks(
  results: Array<{ content: string; score: number; metadata: { attachmentId: string; fileName: string; page?: number } }>,
  userId: string
): Promise<Array<{ content: string; metadata: { attachmentId: string; fileName: string; page?: number } }>> {
  if (results.length === 0) return [];

  const enriched: Array<{ content: string; metadata: { attachmentId: string; fileName: string; page?: number } }> = [];
  const seenContent = new Set<string>();
  const requestedTargets = results
    .filter((result) => result.metadata.attachmentId && result.content)
    .map((result, index) => ({
      ord: index,
      attachment_id: result.metadata.attachmentId,
      content: result.content,
    }));

  if (requestedTargets.length === 0) {
    return [];
  }

  const neighbors = await prisma.$queryRaw<Array<{
    content: string;
    attachment_id: string;
    file_name: string;
    page: number | null;
  }>>`
    WITH requested AS (
      SELECT ord, attachment_id, content
      FROM jsonb_to_recordset(${JSON.stringify(requestedTargets)}::jsonb)
        AS requested(ord int, attachment_id text, content text)
    ),
    target AS (
      SELECT DISTINCT ON (requested.ord)
        requested.ord,
        requested.attachment_id,
        CASE
          WHEN chunk.metadata->>'charStart' ~ '^[0-9]+$'
            THEN (chunk.metadata->>'charStart')::int
          ELSE NULL
        END AS target_char_start
      FROM requested
      JOIN document_chunk chunk
        ON chunk.metadata->>'attachmentId' = requested.attachment_id
       AND chunk.metadata->>'userId' = ${userId}
       AND chunk.content = requested.content
      ORDER BY requested.ord, chunk.created_at ASC
    ),
    chunk_candidates AS (
      SELECT
        target.ord,
        target.target_char_start,
        chunk.content,
        chunk.metadata->>'attachmentId' AS attachment_id,
        chunk.metadata->>'fileName' AS file_name,
        CASE
          WHEN chunk.metadata->>'page' ~ '^[0-9]+$'
            THEN (chunk.metadata->>'page')::int
          ELSE NULL
        END AS page,
        CASE
          WHEN chunk.metadata->>'charStart' ~ '^[0-9]+$'
            THEN (chunk.metadata->>'charStart')::int
          ELSE NULL
        END AS char_start,
        chunk.created_at
      FROM target
      JOIN document_chunk chunk
        ON chunk.metadata->>'attachmentId' = target.attachment_id
       AND chunk.metadata->>'userId' = ${userId}
    ),
    ranked AS (
      SELECT
        content,
        attachment_id,
        file_name,
        page,
        ROW_NUMBER() OVER (
          PARTITION BY ord
          ORDER BY
            CASE WHEN target_char_start IS NULL OR char_start IS NULL THEN 1 ELSE 0 END ASC,
            ABS(char_start - target_char_start) ASC NULLS LAST,
            created_at ASC
        ) AS row_num,
        ord
      FROM chunk_candidates
    )
    SELECT content, attachment_id, file_name, page
    FROM ranked
    WHERE row_num <= 3
    ORDER BY ord ASC, row_num ASC`;

  for (const row of neighbors) {
    const key = `${row.attachment_id}:${row.content.slice(0, 100)}`;
    if (seenContent.has(key)) continue;
    seenContent.add(key);
    enriched.push({
      content: row.content,
      metadata: {
        attachmentId: row.attachment_id,
        fileName: row.file_name,
        page: row.page ?? undefined,
      },
    });
  }

  return enriched;
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

        const scope = await resolveCompletedAttachmentScope(userId, options);
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

        const enrichedResults = await enrichWithNeighborChunks(results, userId);

        return formatRetrievedContext(enrichedResults);
      } catch (error) {
        logger.error('[RAG] Context retrieval failed:', error);
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
