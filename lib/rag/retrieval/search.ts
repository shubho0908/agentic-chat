import { PGVectorStore } from '@langchain/community/vectorstores/pgvector';
import { OpenAIEmbeddings } from '@langchain/openai';
import { RAG_CONFIG } from '../config';
import { getUserApiKey } from '@/lib/apiUtils';
import { rerankDocuments } from './reranker';
import { getPgPool } from '../storage/pgvectorClient';
import { prisma } from '@/lib/prisma';
import {
  computeAdaptiveSimilarityThreshold,
  countUniqueAttachments,
  dedupeCandidates,
  diversifyCandidates,
  extractQueryTerms,
  type RetrievalCandidate,
} from './hybrid';
import { logger } from '@/lib/logger';
import { withRetry } from '@/lib/retry';

async function getEmbeddings(userId: string) {
  const apiKey = await getUserApiKey(userId);
  return new OpenAIEmbeddings({
    model: RAG_CONFIG.embeddings.model,
    apiKey,
  });
}

function getVectorStoreConfig() {
  return {
    pool: getPgPool(),
    tableName: 'document_chunk',
    columns: {
      idColumnName: 'id',
      vectorColumnName: 'embedding',
      contentColumnName: 'content',
      metadataColumnName: 'metadata',
    },
    distanceStrategy: 'cosine' as const,
  };
}

function getMetadataString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function getMetadataPage(metadata: Record<string, unknown>): number | undefined {
  const loc = metadata.loc;
  if (loc && typeof loc === 'object' && 'pageNumber' in loc && typeof loc.pageNumber === 'number') {
    return loc.pageNumber;
  }

  return typeof metadata.page === 'number' ? metadata.page : undefined;
}

export async function searchDocumentChunks(
  query: string,
  userId: string,
  options: {
    limit?: number;
    scoreThreshold?: number;
    attachmentIds?: string[];
    conversationId?: string;
    useReranking?: boolean;
    fileType?: string;
  } = {}
) {
  const {
    limit = RAG_CONFIG.search.defaultLimit,
    scoreThreshold = RAG_CONFIG.search.scoreThreshold,
    attachmentIds,
    conversationId,
    useReranking = true,
    fileType,
  } = options;

  if (!conversationId && !attachmentIds) {
    logger.warn('[RAG Search] Neither conversationId nor attachmentIds provided.');
  }

  const embeddings = await getEmbeddings(userId);
  const vectorStore = new PGVectorStore(embeddings, getVectorStoreConfig());

  const filter: Record<string, string | { in: string[] }> = { userId };

  if (conversationId) {
    filter.conversationId = conversationId;
  }

  if (attachmentIds && attachmentIds.length > 0) {
    filter.attachmentId = { in: attachmentIds };
  }

  if (fileType) {
    filter.fileType = fileType;
  }

  const enableReranking = useReranking && RAG_CONFIG.rerank.enabled;

  const semanticCandidateLimit = Math.max(
    limit,
    limit * RAG_CONFIG.search.semanticCandidateMultiplier
  );
  const semanticResults = await withRetry(
    () => vectorStore.similaritySearchWithScore(query, semanticCandidateLimit, filter),
    { retries: 2, initialDelayMs: 500 }
  );

  const semanticCandidatesRaw: RetrievalCandidate[] = semanticResults.map(([doc, distance]) => ({
    content: doc.pageContent,
    score: Math.max(0, Math.min(1, 1 - distance)),
    metadata: {
      attachmentId: getMetadataString(doc.metadata.attachmentId),
      fileName: getMetadataString(doc.metadata.fileName),
      page: getMetadataPage(doc.metadata),
    },
    source: 'semantic',
  }));

  const minThreshold = enableReranking
    ? Math.min(RAG_CONFIG.search.minScoreThreshold, 0.3)
    : RAG_CONFIG.search.minScoreThreshold;

  const effectiveThreshold = computeAdaptiveSimilarityThreshold({
    baseThreshold: scoreThreshold,
    minThreshold,
    candidateCount: semanticCandidatesRaw.length,
    limit,
  });

  let semanticCandidates = semanticCandidatesRaw.filter(
    (candidate) => candidate.score >= effectiveThreshold
  );

  if (semanticCandidates.length === 0 && semanticCandidatesRaw.length > 0) {
    semanticCandidates = semanticCandidatesRaw.slice(0, Math.min(limit, semanticCandidatesRaw.length));
  }

  const queryTerms = extractQueryTerms(query, RAG_CONFIG.search.lexicalQueryMaxTerms);
  const expectedAttachmentCoverage = attachmentIds?.length
    ? Math.min(attachmentIds.length, Math.max(1, Math.ceil(limit / 2)))
    : Math.max(1, Math.ceil(limit / 2));

  const semanticCoverage = countUniqueAttachments(semanticCandidates);
  const needsLexicalFallback =
    queryTerms.length > 0 &&
    (semanticCandidates.length < limit || semanticCoverage < expectedAttachmentCoverage);

  const lexicalCandidates = needsLexicalFallback
    ? await searchLexicalFallback({
        queryTerms,
        userId,
        conversationId,
        attachmentIds,
        fileType,
        limit: RAG_CONFIG.search.lexicalFallbackLimit,
      })
    : [];

  const mergedCandidates = dedupeCandidates([
    ...semanticCandidates,
    ...lexicalCandidates.map(c => ({
      ...c,
      score: Math.max(0, Math.min(1, (c.score - 0.35) / (0.92 - 0.35))),
    })),
  ]);

  if (mergedCandidates.length === 0) {
    return [];
  }

  const minPerAttachment = (attachmentIds?.length ?? 0) > 1
    ? RAG_CONFIG.search.minPerAttachment
    : 0;

  const preRerankPool = diversifyCandidates(mergedCandidates, {
    limit: Math.min(
      mergedCandidates.length,
      Math.max(limit, limit * RAG_CONFIG.search.preRerankPoolMultiplier)
    ),
    maxPerAttachment: RAG_CONFIG.search.maxPerAttachment,
    minPerAttachment,
  });

  if (enableReranking && preRerankPool.length > 0) {
    const rerankedResults = await rerankDocuments(query, preRerankPool, {
      topN: Math.min(
        preRerankPool.length,
        Math.max(limit, RAG_CONFIG.search.rerankTopNCap)
      ),
    });

    const rerankedCandidates: RetrievalCandidate[] = rerankedResults.map((result) => ({
      content: result.content,
      score: result.score,
      metadata: result.metadata,
    }));

    return diversifyCandidates(rerankedCandidates, {
      limit,
      maxPerAttachment: RAG_CONFIG.search.maxPerAttachment,
      minPerAttachment,
    }).slice(0, limit);
  }

  return diversifyCandidates(preRerankPool, {
    limit,
    maxPerAttachment: RAG_CONFIG.search.maxPerAttachment,
    minPerAttachment,
  }).slice(0, limit);
}

async function searchLexicalFallback(params: {
  queryTerms: string[];
  userId: string;
  conversationId?: string;
  attachmentIds?: string[];
  fileType?: string;
  limit: number;
}): Promise<RetrievalCandidate[]> {
  const searchQuery = params.queryTerms.join(' ');
  if (!searchQuery) {
    return [];
  }

  try {
    const rows = await prisma.$queryRaw<Array<{
      content: string;
      attachment_id: string;
      file_name: string;
      page: number | null;
      lexical_rank: number;
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
        ts_rank_cd(
          to_tsvector('english', content),
          websearch_to_tsquery('english', ${searchQuery})
        ) AS lexical_rank
      FROM document_chunk
      WHERE metadata->>'userId' = ${params.userId}
        AND (${params.conversationId ?? null}::text IS NULL OR metadata->>'conversationId' = ${params.conversationId ?? null})
        AND (${params.attachmentIds?.length ? params.attachmentIds : null}::text[] IS NULL OR metadata->>'attachmentId' = ANY(${params.attachmentIds?.length ? params.attachmentIds : null}::text[]))
        AND (${params.fileType ?? null}::text IS NULL OR metadata->>'fileType' = ${params.fileType ?? null})
        AND to_tsvector('english', content) @@ websearch_to_tsquery('english', ${searchQuery})
      ORDER BY lexical_rank DESC
      LIMIT ${params.limit}`;

    const maxRank = Math.max(
      ...rows.map((row) => row.lexical_rank || 0),
      0.00001
    );

    return rows.map((row, index) => {
      const normalizedRank = (row.lexical_rank || 0) / maxRank;
      const positionalBoost = Math.max(0.1, 1 - index * 0.04);
      const blendedScore = Math.max(
        0.35,
        Math.min(0.92, normalizedRank * 0.75 + positionalBoost * 0.2)
      );

      return {
        content: row.content,
        score: blendedScore,
        metadata: {
          attachmentId: row.attachment_id,
          fileName: row.file_name,
          page: row.page ?? undefined,
        },
        source: 'lexical',
      };
    });
  } catch (error) {
    logger.warn('[RAG Search] Lexical fallback failed:', {
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}
