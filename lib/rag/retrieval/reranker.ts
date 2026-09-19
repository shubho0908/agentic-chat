import { createHash } from "node:crypto";
import { CohereClientV2 } from "cohere-ai";
import { RAG_CONFIG } from "../config";
import type { RerankDocument, RerankResult } from "@/types/rag";
import { createRequestId, logError, logWarn } from "@/lib/observability";
import { JevCheckpoint, JevFallbackReason, JevMode } from "@/lib/jev/types";
import { JevDecisionClient } from "@/lib/jev/client";
import { getJevMode } from "@/lib/jev/config";
import { logJevDecision } from "@/lib/jev/telemetry";
import { rerankWithJev } from "@/lib/jev/reranker";

/** Deterministic 50/50 bucket for A/B mode. Same key always lands in the
 * same arm so treatment and control stay comparable. Empty keys stay on
 * control so unkeyed traffic never changes behavior. */
export function isJevRerankCohort(cohortKey: string): boolean {
  if (!cohortKey) return false;
  return createHash("sha256").update(cohortKey).digest()[0] < 128;
}

function passthrough(documents: RerankDocument[]): RerankResult[] {
  return documents.map((doc) => ({
    ...doc,
  }));
}

export function mapProviderRerankResults(
  documents: RerankDocument[],
  results: Array<{ index: number; relevanceScore: number }>,
): RerankResult[] {
  const seen = new Set<number>();
  const mapped: RerankResult[] = [];
  for (const result of results) {
    if (
      !Number.isInteger(result.index) ||
      result.index < 0 ||
      result.index >= documents.length ||
      seen.has(result.index) ||
      !Number.isFinite(result.relevanceScore)
    )
      continue;
    seen.add(result.index);
    const original = documents[result.index];
    mapped.push({
      content: original.content,
      score: result.relevanceScore,
      metadata: original.metadata,
    });
  }
  return mapped.length ? mapped : passthrough(documents);
}

export async function rerankWithCohere(
  apiKey: string,
  query: string,
  documents: RerankDocument[],
  topN: number,
): Promise<RerankResult[]> {
  const cohere = new CohereClientV2({ token: apiKey });

  const response = await cohere.rerank({
    model: RAG_CONFIG.rerank.model,
    query,
    documents: documents.map((doc) => doc.content),
    topN,
  });

  if (!response.results || response.results.length === 0) {
    logWarn({
      event: "reranker_empty_results",
      message: "No results from reranking, returning original order",
    });
    return passthrough(documents);
  }

  return mapProviderRerankResults(documents, response.results);
}

export async function rerankDocuments(
  query: string,
  documents: RerankDocument[],
  options: {
    topN?: number;
    conversationId?: string;
    cohereRerank?: typeof rerankWithCohere;
  } = {},
): Promise<RerankResult[]> {
  const apiKey = process.env.COHERE_API_KEY;
  const jevClient = JevDecisionClient.createIfConfigured();
  const mode = getJevMode(JevCheckpoint.RERANK);
  const topN = Math.min(options.topN ?? documents.length, documents.length);

  if (documents.length === 0) {
    return [];
  }

  const cohortKey = options.conversationId
    ? `${options.conversationId}\n${query}`
    : query;
  const conversationScope = options.conversationId
    ? { conversationId: options.conversationId }
    : {};
  const inJevCohort =
    mode === JevMode.ACTIVE ||
    (mode === JevMode.AB && isJevRerankCohort(cohortKey));

  if (mode === JevMode.AB && !inJevCohort) {
    const requestId = createRequestId("jev_rerank");
    logJevDecision({
      checkpoint: JevCheckpoint.RERANK,
      schemaVersion: "1.0.0",
      modelVersion: `cohere/${RAG_CONFIG.rerank.model}`,
      mode,
      latencyMs: 0,
      outcome: "control_cohere",
      fallbackUsed: false,
      requestId,
      ...conversationScope,
    });
  }

  if (inJevCohort && jevClient) {
    const requestId = createRequestId("jev_rerank");
    const startedAt = Date.now();
    try {
      const { results, modelVersion } = await rerankWithJev(
        jevClient,
        query,
        documents,
        {
          requestId,
          ...conversationScope,
        },
      );
      logJevDecision({
        checkpoint: JevCheckpoint.RERANK,
        schemaVersion: "1.0.0",
        modelVersion,
        mode,
        latencyMs: Date.now() - startedAt,
        outcome: `reranked_${results.length}`,
        fallbackUsed: false,
        requestId,
        ...conversationScope,
      });
      return results.slice(0, topN);
    } catch (error) {
      logWarn({
        event: "jev_rerank_fallback",
        message: "Jev rerank failed, falling back to Cohere",
        error: error instanceof Error ? error.message : String(error),
        requestId,
      });
      logJevDecision({
        checkpoint: JevCheckpoint.RERANK,
        schemaVersion: "1.0.0",
        modelVersion: "unknown",
        mode,
        latencyMs: Date.now() - startedAt,
        outcome: "error",
        fallbackUsed: true,
        fallbackReason:
          error instanceof Error && error.name === "AbortError"
            ? JevFallbackReason.TIMEOUT
            : JevFallbackReason.ERROR,
        requestId,
        ...conversationScope,
      });
    }
  }

  if (!apiKey) {
    logWarn({
      event: "reranker_disabled",
      message: "COHERE_API_KEY not set, skipping reranking",
    });
    return passthrough(documents);
  }

  try {
    return await (options.cohereRerank ?? rerankWithCohere)(
      apiKey,
      query,
      documents,
      topN,
    );
  } catch (error) {
    logError({
      event: "reranker_failed",
      error: error instanceof Error ? error.message : String(error),
    });
    return passthrough(documents);
  }
}
