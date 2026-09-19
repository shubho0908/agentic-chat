import type { RerankDocument, RerankResult } from "@/types/rag";
import type { JevDecisionClient, JevEvaluateResult } from "./client";
import { JevCheckpoint, type JevQuestions } from "./types";

export const JEV_RERANK_SCHEMA_VERSION = "1.0.0";
export const JEV_RERANK_TIMEOUT_MS = 2_000;
export const JEV_RERANK_MAX_CONCURRENCY = 4;

const RERANK_QUESTIONS: JevQuestions = {
  answers_query: {
    type: "noul",
    instructions:
      "Does this candidate contain information usable in a direct answer to the query?",
    criteria: {
      true: "The passage directly supplies facts or reasoning needed for the answer.",
      false:
        "It is unrelated, only shares terminology, or lacks usable evidence.",
    },
  },
};

export function mapJevRerankScore(result: JevEvaluateResult): number | null {
  const answer = result.answers.answers_query;
  return answer?.type === "noul" ? answer.noul : null;
}

async function mapWithConcurrencyLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  let failed = false;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (!failed && next < items.length) {
        const index = next++;
        try {
          results[index] = await fn(items[index]);
        } catch (error) {
          failed = true;
          throw error;
        }
      }
    },
  );
  await Promise.all(workers);
  return results;
}


/** Scores the bounded shortlist; throws if any candidate fails or returns an
 * invalid score so callers fall back to Cohere for the whole shortlist instead
 * of mixing incomparable score scales in one ranking. */
export interface JevRerankOutcome {
  results: RerankResult[];
  /** Model reported by the service. First non-unknown response wins;
   * requests use one model so any response is representative. */
  modelVersion: string;
}

export async function rerankWithJev(
  client: JevDecisionClient,
  query: string,
  documents: RerankDocument[],
  traceContext: { requestId: string; conversationId?: string },
): Promise<JevRerankOutcome> {
  let modelVersion: string | null = null;
  const scored = await mapWithConcurrencyLimit(
    documents,
    JEV_RERANK_MAX_CONCURRENCY,
    async (doc): Promise<RerankResult> => {
      const result = await client.evaluate({
        checkpoint: JevCheckpoint.RERANK,
        schemaVersion: JEV_RERANK_SCHEMA_VERSION,
        state: {
          query,
          candidate: { content: doc.content, metadata: doc.metadata },
        },
        questions: RERANK_QUESTIONS,
        timeoutMs: JEV_RERANK_TIMEOUT_MS,
        traceContext,
      });
      if (modelVersion === null || modelVersion === "unknown") {
        modelVersion = result.modelVersion;
      }
      const score = mapJevRerankScore(result);
      if (score === null) {
        throw new Error("Jev rerank returned an invalid score");
      }
      return {
        content: doc.content,
        score,
        originalScore: doc.score,
        metadata: doc.metadata,
      };
    },
  );

  return {
    results: scored.sort((a, b) => b.score - a.score),
    modelVersion: modelVersion ?? "unknown",
  };
}
