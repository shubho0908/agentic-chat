import { searchDocumentChunks } from "./search";
import { prisma } from "@/lib/prisma";
import { RAG_CONFIG } from "../config";
import {
  waitForDocumentProcessing,
  getCompletedAttachmentIds,
  getAttachmentStatuses,
} from "./status";
import {
  partitionByStatus,
  extractIds,
  filterDocumentAttachments,
} from "./statusHelpers";
import type { RAGContextOptions, RAGContextResult } from "@/types/rag";
import { withTrace } from "@/lib/langsmithConfig";
import { runOrQueueDocumentProcessingJob } from "@/lib/orchestration/documentJobs";
import { logger } from "@/lib/logger";
import { logWarn } from "@/lib/observability";
import {
  candidateKey,
  reciprocalRankFuse,
  type RetrievalCandidate,
} from "./hybrid";
import { gatePassages } from "@/lib/jev/passageGate";

interface ResolvedAttachmentScope {
  attachmentIds: string[];
  attachmentCount: number;
}

/** Honest citation bands from retrieval scores. Neighbors inherit their
 * source result's score, so adjacency never invents relevance. */
export function relevanceForScore(score: number | undefined): string {
  if (score === undefined) return "unknown";
  if (score >= 0.8) return "high";
  if (score >= 0.5) return "medium";
  return "low";
}

export function formatRetrievedContext(
  results: RetrievalCandidate[],
  kind: "retrieved" | "coverage" = "retrieved",
  attachmentKind: "document" | "snippet" = "document",
): RAGContextResult {
  const usedAttachmentIds = Array.from(
    new Set(results.map((result) => result.metadata.attachmentId)),
  );
  const context = results
    .map((result, index) => {
      const page = result.metadata.page
        ? ` (Page ${result.metadata.page})`
        : "";
      return `[${attachmentKind === "snippet" ? "Snippet" : "Document"} ${index + 1}: ${result.metadata.fileName}${page}; chunk ${result.metadata.chunkId ?? "unknown"}]\n${result.content}`;
    })
    .join("\n\n---\n\n");
  const seen = new Set<string>();
  const citations = results.flatMap((result) => {
    const id = result.metadata.chunkId ?? candidateKey(result);
    if (seen.has(id)) return [];
    seen.add(id);
    // Raw lexical ranks are unbounded ordering signals, not normalized
    // probabilities, so lexical-only evidence gets no match percentage
    // instead of a clamped "100%". Bounded semantic similarities and
    // reranker relevance scores stay displayable.
    const displayScore =
      kind === "coverage" || result.scoreOrigin === "lexical"
        ? undefined
        : result.score;
    return [
      {
        id,
        source: result.metadata.fileName,
        relevance:
          kind === "coverage"
            ? "coverage-sample"
            : relevanceForScore(displayScore),
        score: displayScore,
        page: result.metadata.page,
      },
    ];
  });
  const intro =
    kind === "coverage"
      ? `The following is ${attachmentKind} coverage sampling, not query-retrieved evidence. Use it only to explain ${attachmentKind} contents at a high level.`
      : `Use the following retrieved ${attachmentKind} evidence before answering.`;
  const tag =
    kind === "coverage"
      ? `${attachmentKind}_coverage_samples`
      : `retrieved_${attachmentKind}s`;
  return {
    context: `\n\n${intro}\n<${tag}>\n${context}\n</${tag}>`,
    documentCount: usedAttachmentIds.length,
    usedAttachmentIds,
    citations,
  };
}

async function ensureAttachmentsProcessed(
  attachmentIds: string[],
  userId: string,
  options: {
    processingTimeoutMs?: number;
    kickScope: string;
    signal?: AbortSignal;
  },
): Promise<string[]> {
  const statuses = await getAttachmentStatuses(attachmentIds, userId);
  const partitioned = partitionByStatus(statuses);
  const alreadyCompleted = extractIds(partitioned.completed);

  const failedIds = extractIds(partitioned.failed);
  if (failedIds.length > 0) {
    await prisma.attachment.updateMany({
      where: { id: { in: failedIds } },
      data: { processingStatus: "PENDING", processingError: null },
    });
    await prisma.$executeRaw`
      DELETE FROM orchestration_job
      WHERE type = 'document_process'
        AND dedupe_key = ANY(${failedIds}::text[])
        AND status = 'failed'`;
  }

  const retryableIds = extractIds([
    ...partitioned.pending,
    ...partitioned.failed,
  ]);
  if (retryableIds.length > 0) {
    await Promise.allSettled(
      retryableIds.map((attachmentId) =>
        runOrQueueDocumentProcessingJob(attachmentId, userId).catch((error) => {
          logger.warn(
            `[RAG] Failed to kick off ${options.kickScope} document processing:`,
            {
              attachmentId,
              error: error instanceof Error ? error.message : String(error),
            },
          );
        }),
      ),
    );
  }

  const needProcessing = extractIds([
    ...partitioned.processing,
    ...partitioned.pending,
    ...partitioned.failed,
  ]);
  if (needProcessing.length === 0) {
    return alreadyCompleted;
  }
  const newlyCompleted = await waitForDocumentProcessing(needProcessing, {
    timeoutMs: options.processingTimeoutMs,
    userId,
    signal: options.signal,
  });
  return [...alreadyCompleted, ...newlyCompleted];
}

async function resolveCompletedAttachmentScope(
  userId: string,
  options: RAGContextOptions = {},
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
            kind: true,
            processingStatus: true,
          },
        },
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    const allAttachments = messages.flatMap((message) => message.attachments);
    const documentAttachments = filterDocumentAttachments(
      allAttachments,
      options.attachmentKind ?? "document",
    );
    const partitioned = partitionByStatus(documentAttachments);

    const completedIds = extractIds(partitioned.completed);
    const processingIds = extractIds([
      ...partitioned.processing,
      ...partitioned.pending,
      ...partitioned.failed,
    ]);

    if (processingIds.length > 0 && waitForProcessing) {
      const ensured = await ensureAttachmentsProcessed(processingIds, userId, {
        processingTimeoutMs: options.processingTimeoutMs,
        kickScope: "pending",
        signal: options.signal,
      });
      attachmentIds = Array.from(new Set([...completedIds, ...ensured]));
    } else {
      attachmentIds = completedIds;
    }
  }

  if (!attachmentIds || attachmentIds.length === 0) return null;
  const scopedAttachments = await prisma.attachment.findMany({
    where: {
      id: { in: attachmentIds },
      kind: options.attachmentKind ?? "document",
      message: {
        conversation: { userId },
        ...(conversationId ? { conversationId } : {}),
      },
    },
    select: { id: true },
  });
  if (new Set(attachmentIds).size !== scopedAttachments.length) return null;

  let completedAttachmentIds = attachmentIds;

  if (waitForProcessing) {
    const statuses = await getAttachmentStatuses(attachmentIds, userId);
    const partitioned = partitionByStatus(statuses);

    const needProcessing = extractIds([
      ...partitioned.processing,
      ...partitioned.pending,
      ...partitioned.failed,
    ]);
    const alreadyCompleted = extractIds(partitioned.completed);

    if (needProcessing.length > 0) {
      const ensured = await ensureAttachmentsProcessed(needProcessing, userId, {
        processingTimeoutMs: options.processingTimeoutMs,
        kickScope: "provided",
        signal: options.signal,
      });
      // Final scope is every completed id: files that were already done stay
      // in scope alongside newly processed ones. Dropping either side
      // silently excludes finished documents from retrieval.
      completedAttachmentIds = Array.from(
        new Set([...alreadyCompleted, ...ensured]),
      );
    } else {
      completedAttachmentIds = alreadyCompleted;
    }
  } else {
    completedAttachmentIds = await getCompletedAttachmentIds(
      attachmentIds,
      userId,
    );
  }

  if (completedAttachmentIds.length === 0) {
    return null;
  }

  return {
    attachmentIds: completedAttachmentIds,
    attachmentCount: completedAttachmentIds.length,
  };
}

export function mergeNeighborCandidates(
  results: RetrievalCandidate[],
  neighborRows: Array<{
    id: string;
    content: string;
    attachment_id: string;
    file_name: string;
    page: number | null;
    char_start: number | null;
    ord: number;
  }>,
  limit = RAG_CONFIG.search.maxEnrichedChunks,
): RetrievalCandidate[] {
  const grouped = new Map<number, RetrievalCandidate[]>();
  for (const row of neighborRows) {
    const parent = results[row.ord];
    if (!parent) continue;
    const values = grouped.get(row.ord) ?? [];
    values.push({
      content: row.content,
      score: parent.score,
      scoreOrigin: parent.scoreOrigin,
      metadata: {
        attachmentId: row.attachment_id,
        fileName: row.file_name,
        page: row.page ?? undefined,
        charStart: row.char_start ?? undefined,
        chunkId: row.id,
      },
    });
    grouped.set(row.ord, values);
  }
  const ordered: RetrievalCandidate[] = [];
  const seen = new Set<string>();
  const append = (candidate: RetrievalCandidate) => {
    const key = candidateKey(candidate);
    if (!seen.has(key)) {
      seen.add(key);
      ordered.push(candidate);
    }
  };
  results.forEach(append);
  results.forEach((_, index) => (grouped.get(index) ?? []).forEach(append));
  return ordered.slice(0, limit);
}

export async function getScopedDocumentCoverage(
  userId: string,
  conversationId: string | undefined,
  attachmentIds: string[],
): Promise<RetrievalCandidate[]> {
  if (attachmentIds.length === 0) return [];
  const rows = await prisma.$queryRaw<
    Array<{
      id: string;
      content: string;
      attachment_id: string;
      file_name: string;
      page: number | null;
      char_start: number | null;
    }>
  >`
    WITH ranked AS (
      SELECT COALESCE(metadata->>'chunkId', id::text) AS id,
        LEFT(content, 12000) AS content,
        metadata->>'attachmentId' AS attachment_id,
        metadata->>'fileName' AS file_name,
        CASE WHEN metadata->>'page' ~ '^[0-9]+$' THEN (metadata->>'page')::int END AS page,
        CASE WHEN metadata->>'charStart' ~ '^[0-9]+$' THEN (metadata->>'charStart')::int END AS char_start,
        ROW_NUMBER() OVER (PARTITION BY metadata->>'attachmentId'
          ORDER BY CASE WHEN metadata->>'page' ~ '^[0-9]+$' THEN (metadata->>'page')::int END NULLS LAST,
            CASE WHEN metadata->>'charStart' ~ '^[0-9]+$' THEN (metadata->>'charStart')::int END NULLS LAST, id) AS row_num
      FROM document_chunk
      WHERE metadata->>'userId' = ${userId}
        AND (${conversationId ?? null}::text IS NULL OR metadata->>'conversationId' = ${conversationId ?? null})
        AND metadata->>'attachmentId' = ANY(${attachmentIds}::text[])
    )
    SELECT id, content, attachment_id, file_name, page, char_start
    FROM ranked WHERE row_num <= 2 ORDER BY attachment_id, row_num LIMIT ${attachmentIds.length * 2}`;
  return rows
    .filter(
      (row) => row.content.trim() && attachmentIds.includes(row.attachment_id),
    )
    .map((row) => ({
      content: row.content,
      score: 0,
      metadata: {
        chunkId: row.id,
        attachmentId: row.attachment_id,
        fileName: row.file_name,
        page: row.page ?? undefined,
        charStart: row.char_start ?? undefined,
      },
    }));
}

async function enrichWithNeighborChunks(
  results: RetrievalCandidate[],
  userId: string,
  attachmentIds: string[],
): Promise<RetrievalCandidate[]> {
  if (!results.length) return [];
  const targets = results.flatMap((result, ord) =>
    result.metadata.chunkId ? [{ ord, id: result.metadata.chunkId }] : [],
  );
  const neighbors = targets.length
    ? await prisma.$queryRaw<
        Array<{
          id: string;
          content: string;
          attachment_id: string;
          file_name: string;
          page: number | null;
          char_start: number | null;
          ord: number;
          distance: number;
        }>
      >`
    WITH requested AS (SELECT ord, id FROM jsonb_to_recordset(${JSON.stringify(targets)}::jsonb) AS x(ord int,id text)),
    target AS (SELECT requested.ord, chunk.metadata->>'attachmentId' attachment_id, CASE WHEN chunk.metadata->>'charStart' ~ '^[0-9]+$' THEN (chunk.metadata->>'charStart')::int END target_start FROM requested JOIN document_chunk chunk ON COALESCE(chunk.metadata->>'chunkId',chunk.id::text)=requested.id AND chunk.metadata->>'userId'=${userId} AND chunk.metadata->>'attachmentId'=ANY(${attachmentIds}::text[])),
    ranked AS (SELECT COALESCE(chunk.metadata->>'chunkId', chunk.id::text) AS id,chunk.content,chunk.metadata->>'attachmentId' attachment_id,chunk.metadata->>'fileName' file_name,CASE WHEN chunk.metadata->>'page' ~ '^[0-9]+$' THEN (chunk.metadata->>'page')::int END page,CASE WHEN chunk.metadata->>'charStart' ~ '^[0-9]+$' THEN (chunk.metadata->>'charStart')::int END char_start,target.ord,ABS((chunk.metadata->>'charStart')::int-target.target_start) distance,ROW_NUMBER() OVER(PARTITION BY target.ord ORDER BY ABS((chunk.metadata->>'charStart')::int-target.target_start),chunk.id) row_num FROM target JOIN document_chunk chunk ON chunk.metadata->>'attachmentId'=target.attachment_id AND chunk.metadata->>'userId'=${userId} AND chunk.metadata->>'attachmentId'=ANY(${attachmentIds}::text[]) WHERE chunk.metadata->>'charStart' ~ '^[0-9]+$')
    SELECT id,content,attachment_id,file_name,page,char_start,ord,distance FROM ranked WHERE row_num<=${RAG_CONFIG.search.neighborChunksPerHit + 1} ORDER BY ord,row_num`
    : [];
  // Ranked hits lead; neighbors follow in parent-rank order. The pure helper
  // makes ordering, de-duplication, and the hard cap independently testable.
  return mergeNeighborCandidates(results, neighbors);
}

export async function getRAGContext(
  query: string,
  userId: string,
  options: RAGContextOptions = {},
): Promise<RAGContextResult | null> {
  return withTrace(
    "rag-context-retrieval",
    async () => {
      try {
        const {
          conversationId,
          limit = RAG_CONFIG.search.defaultLimit,
          scoreThreshold = RAG_CONFIG.search.scoreThreshold,
        } = options;

        const scope = await resolveCompletedAttachmentScope(userId, options);
        if (!scope) {
          logWarn({
            event: "rag_retrieval_empty_scope",
            userId,
            conversationId: options.conversationId,
            providedAttachmentCount: options.attachmentIds?.length ?? 0,
          });
          return null;
        }

        const adjustedLimit = Math.max(
          limit,
          Math.min(scope.attachmentIds.length * 3, 15),
        );

        const queries = Array.from(
          new Set(
            [query, ...(options.queryVariants ?? [])]
              .map((value) => value.trim())
              .filter(Boolean),
          ),
        );
        const rankings = await Promise.all(
          queries.map((variant) =>
            searchDocumentChunks(variant, userId, {
              limit: adjustedLimit,
              scoreThreshold,
              conversationId,
              attachmentIds: scope.attachmentIds,
              signal: options.signal,
            }),
          ),
        );
        const results = reciprocalRankFuse(rankings, {
          k: RAG_CONFIG.search.rrfK,
          limit: adjustedLimit,
        });
        const scopedIds = new Set(scope.attachmentIds);
        const scopedResults = results.filter((result) =>
          scopedIds.has(result.metadata.attachmentId),
        );
        if (!scopedResults.length) {
          logWarn({
            event: "rag_retrieval_no_matches",
            userId,
            conversationId: options.conversationId,
            providedAttachmentCount: scope.attachmentIds.length,
            queryVariantCount: queries.length,
          });
          const samples = await getScopedDocumentCoverage(
            userId,
            conversationId,
            scope.attachmentIds,
          );
          const sampledIds = new Set(
            samples.map((sample) => sample.metadata.attachmentId),
          );
          if (scope.attachmentIds.some((id) => !sampledIds.has(id)))
            return null;
          const safeSamples = await gatePassages(
            query,
            samples,
            conversationId,
          );
          if (safeSamples.length !== samples.length) return null;
          return formatRetrievedContext(
            safeSamples,
            "coverage",
            options.attachmentKind ?? "document",
          );
        }
        const enrichedResults = (
          await enrichWithNeighborChunks(
            scopedResults,
            userId,
            scope.attachmentIds,
          )
        ).filter((result) => scopedIds.has(result.metadata.attachmentId));
        // Gate the final prompt passages, including neighbors, so untrusted
        // instructions cannot enter merely by being adjacent to a good hit.
        const gatedResults = await gatePassages(
          query,
          enrichedResults,
          conversationId,
        );
        if (!gatedResults.length) {
          logWarn({
            event: "rag_retrieval_all_passages_rejected",
            userId,
            conversationId: options.conversationId,
            candidateCount: enrichedResults.length,
          });
          return null;
        }
        return formatRetrievedContext(
          gatedResults,
          "retrieved",
          options.attachmentKind ?? "document",
        );
      } catch (error) {
        if (
          options.signal?.aborted ||
          (error instanceof Error && error.name === "AbortError")
        )
          throw error;
        logger.error("[RAG] Context retrieval failed:", error);
        logWarn({
          event: "rag_retrieval_error",
          userId,
          conversationId: options.conversationId,
          error: error instanceof Error ? error.name : "unknown",
        });
        return null;
      }
    },
    {
      userId,
      conversationId: options.conversationId,
      queryLength: query.length,
      limit: options.limit ?? RAG_CONFIG.search.defaultLimit,
      scoreThreshold:
        options.scoreThreshold ?? RAG_CONFIG.search.scoreThreshold,
      waitForProcessing: options.waitForProcessing,
      providedAttachmentCount: options.attachmentIds?.length || 0,
    },
  );
}
