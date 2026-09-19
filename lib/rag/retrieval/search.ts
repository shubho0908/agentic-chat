import { PGVectorStore } from "@langchain/community/vectorstores/pgvector";
import { OpenAIEmbeddings } from "@langchain/openai";
import { RAG_CONFIG } from "../config";
import { getUserApiKey } from "@/lib/apiUtils";
import { rerankDocuments } from "./reranker";
import { getPgPool } from "../storage/pgvectorClient";
import { prisma } from "@/lib/prisma";
import {
  computeAdaptiveSimilarityThreshold,
  diversifyCandidates,
  extractQueryTerms,
  reciprocalRankFuse,
  type RetrievalCandidate,
} from "./hybrid";
import { logger } from "@/lib/logger";
import { withRetry } from "@/lib/retry";

async function getEmbeddings(userId: string) {
  return new OpenAIEmbeddings({
    model: RAG_CONFIG.embeddings.model,
    apiKey: await getUserApiKey(userId),
  });
}
function vectorConfig() {
  return {
    pool: getPgPool(),
    tableName: "document_chunk",
    columns: {
      idColumnName: "id",
      vectorColumnName: "embedding",
      contentColumnName: "content",
      metadataColumnName: "metadata",
    },
    distanceStrategy: "cosine" as const,
  };
}
function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}
function numeric(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}
function page(metadata: Record<string, unknown>): number | undefined {
  const loc = metadata.loc;
  return loc && typeof loc === "object" && "pageNumber" in loc
    ? numeric(loc.pageNumber)
    : numeric(metadata.page);
}
function fromMetadata(
  content: string,
  score: number,
  metadata: Record<string, unknown>,
): RetrievalCandidate {
  return {
    content,
    score,
    metadata: {
      attachmentId: text(metadata.attachmentId),
      fileName: text(metadata.fileName),
      page: page(metadata),
      chunkId: text(metadata.chunkId) || undefined,
      charStart: numeric(metadata.charStart),
    },
  };
}

async function hydrateChunkIds(
  candidates: RetrievalCandidate[],
  userId: string,
): Promise<RetrievalCandidate[]> {
  const missing = candidates.filter(
    (candidate) =>
      !candidate.metadata.chunkId && candidate.metadata.attachmentId,
  );
  if (!missing.length) return candidates;
  const requested = missing.map((candidate, ord) => ({
    ord,
    attachment_id: candidate.metadata.attachmentId,
    content: candidate.content,
  }));
  const rows = await prisma.$queryRaw<Array<{ ord: number; id: string }>>`
    WITH requested AS (SELECT ord, attachment_id, content FROM jsonb_to_recordset(${JSON.stringify(requested)}::jsonb) AS x(ord int, attachment_id text, content text))
    SELECT DISTINCT ON (requested.ord) requested.ord, COALESCE(chunk.metadata->>'chunkId', chunk.id::text) AS id
    FROM requested JOIN document_chunk chunk ON chunk.metadata->>'attachmentId'=requested.attachment_id AND chunk.metadata->>'userId'=${userId} AND chunk.content=requested.content
    ORDER BY requested.ord, chunk.created_at DESC`;
  const ids = new Map(rows.map((row) => [row.ord, row.id]));
  let missingOrd = 0;
  return candidates.map((candidate) => {
    if (candidate.metadata.chunkId || !candidate.metadata.attachmentId)
      return candidate;
    const chunkId = ids.get(missingOrd++);
    return chunkId
      ? { ...candidate, metadata: { ...candidate.metadata, chunkId } }
      : candidate;
  });
}

async function lexicalSearch(params: {
  terms: string[];
  userId: string;
  conversationId?: string;
  attachmentIds?: string[];
  fileType?: string;
  limit: number;
}): Promise<RetrievalCandidate[]> {
  const query = params.terms.join(" ");
  if (!query) return [];
  try {
    const rows = await prisma.$queryRaw<
      Array<{
        id: string;
        content: string;
        attachment_id: string;
        file_name: string;
        page: number | null;
        char_start: number | null;
        lexical_rank: number;
      }>
    >`
      SELECT COALESCE(metadata->>'chunkId', id::text) AS id, content, metadata->>'attachmentId' attachment_id, metadata->>'fileName' file_name,
        CASE WHEN metadata->>'page' ~ '^[0-9]+$' THEN (metadata->>'page')::int ELSE NULL END page,
        CASE WHEN metadata->>'charStart' ~ '^[0-9]+$' THEN (metadata->>'charStart')::int ELSE NULL END char_start,
        ts_rank_cd(to_tsvector(${RAG_CONFIG.search.lexicalLanguage}::regconfig, content), websearch_to_tsquery(${RAG_CONFIG.search.lexicalLanguage}::regconfig, ${query})) lexical_rank
      FROM document_chunk WHERE metadata->>'userId'=${params.userId}
        AND (${params.conversationId ?? null}::text IS NULL OR metadata->>'conversationId'=${params.conversationId ?? null})
        AND (${params.attachmentIds?.length ? params.attachmentIds : null}::text[] IS NULL OR metadata->>'attachmentId'=ANY(${params.attachmentIds?.length ? params.attachmentIds : null}::text[]))
        AND (${params.fileType ?? null}::text IS NULL OR metadata->>'fileType'=${params.fileType ?? null})
        AND to_tsvector(${RAG_CONFIG.search.lexicalLanguage}::regconfig, content) @@ websearch_to_tsquery(${RAG_CONFIG.search.lexicalLanguage}::regconfig, ${query})
      ORDER BY lexical_rank DESC, id ASC LIMIT ${params.limit}`;
    return rows.map((row) => ({
      content: row.content,
      score: Number(row.lexical_rank),
      metadata: {
        attachmentId: row.attachment_id,
        fileName: row.file_name,
        page: row.page ?? undefined,
        charStart: row.char_start ?? undefined,
        chunkId: row.id,
      },
    }));
  } catch (error) {
    logger.warn("[RAG Search] Lexical search failed:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
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
  } = {},
): Promise<RetrievalCandidate[]> {
  const {
    limit = RAG_CONFIG.search.defaultLimit,
    scoreThreshold = RAG_CONFIG.search.scoreThreshold,
    attachmentIds,
    conversationId,
    useReranking = true,
    fileType,
  } = options;
  const filter: Record<string, string | { in: string[] }> = { userId };
  if (conversationId) filter.conversationId = conversationId;
  if (attachmentIds?.length) filter.attachmentId = { in: attachmentIds };
  if (fileType) filter.fileType = fileType;
  const candidateLimit = Math.max(
    limit,
    limit * RAG_CONFIG.search.semanticCandidateMultiplier,
  );
  const vectorStore = new PGVectorStore(
    await getEmbeddings(userId),
    vectorConfig(),
  );
  const raw = await withRetry(
    () => vectorStore.similaritySearchWithScore(query, candidateLimit, filter),
    { retries: 2, initialDelayMs: 500 },
  );
  const semanticRaw = await hydrateChunkIds(
    raw.map(([doc, distance]) =>
      fromMetadata(
        doc.pageContent,
        Math.max(0, Math.min(1, 1 - distance)),
        doc.metadata,
      ),
    ),
    userId,
  );
  const threshold = computeAdaptiveSimilarityThreshold({
    baseThreshold: scoreThreshold,
    minThreshold: useReranking
      ? Math.min(RAG_CONFIG.search.minScoreThreshold, 0.3)
      : RAG_CONFIG.search.minScoreThreshold,
    candidateCount: semanticRaw.length,
    limit,
  });
  let semantic = semanticRaw.filter(
    (candidate) => candidate.score >= threshold,
  );
  if (!semantic.length) semantic = semanticRaw.slice(0, limit);
  const lexical = await lexicalSearch({
    terms: extractQueryTerms(query, RAG_CONFIG.search.lexicalQueryMaxTerms),
    userId,
    conversationId,
    attachmentIds,
    fileType,
    limit: RAG_CONFIG.search.lexicalFallbackLimit,
  });
  const fused = reciprocalRankFuse([semantic, lexical], {
    k: RAG_CONFIG.search.rrfK,
    limit: Math.max(limit, RAG_CONFIG.search.rerankTopNCap),
  });
  if (!fused.length) return [];
  const pre = diversifyCandidates(fused, {
    limit: Math.min(
      fused.length,
      Math.max(limit, limit * RAG_CONFIG.search.preRerankPoolMultiplier),
    ),
    maxPerAttachment: RAG_CONFIG.search.maxPerAttachment,
    minPerAttachment:
      (attachmentIds?.length ?? 0) > 1 ? RAG_CONFIG.search.minPerAttachment : 0,
  });
  if (useReranking && RAG_CONFIG.rerank.enabled) {
    const reranked = await rerankDocuments(query, pre, {
      topN: Math.min(
        pre.length,
        Math.max(limit, RAG_CONFIG.search.rerankTopNCap),
      ),
      conversationId,
    });
    return diversifyCandidates(
      reranked.map((result) => ({
        content: result.content,
        score: result.score,
        metadata: result.metadata,
      })),
      {
        limit,
        maxPerAttachment: RAG_CONFIG.search.maxPerAttachment,
        minPerAttachment:
          (attachmentIds?.length ?? 0) > 1
            ? RAG_CONFIG.search.minPerAttachment
            : 0,
      },
    );
  }
  return diversifyCandidates(pre, {
    limit,
    maxPerAttachment: RAG_CONFIG.search.maxPerAttachment,
    minPerAttachment:
      (attachmentIds?.length ?? 0) > 1 ? RAG_CONFIG.search.minPerAttachment : 0,
  });
}
