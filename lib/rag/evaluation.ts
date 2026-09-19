export interface LabeledQuery {
  id: string;
  relevantChunkIds: string[];
  relevanceGrades?: Record<string, number>;
}
export interface RankedQueryResult {
  queryId: string;
  rankedChunkIds: string[];
}
export interface RetrievalMetrics {
  recallAtK: number;
  mrr: number;
  ndcgAt10: number;
  queryCount: number;
}
function mean(values: number[]): number {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
}
export function evaluateRetrieval(
  labels: LabeledQuery[],
  results: RankedQueryResult[],
  k = 10,
): RetrievalMetrics {
  const byQuery = new Map(
    results.map((result) => [result.queryId, result.rankedChunkIds]),
  );
  const recalls: number[] = [];
  const reciprocalRanks: number[] = [];
  const ndcgs: number[] = [];
  for (const label of labels) {
    const ranking = byQuery.get(label.id) ?? [];
    const relevant = new Set(label.relevantChunkIds);
    const top = ranking.slice(0, k);
    recalls.push(
      relevant.size
        ? [...relevant].filter((id) => top.includes(id)).length / relevant.size
        : 0,
    );
    const first = ranking.findIndex((id) => relevant.has(id));
    reciprocalRanks.push(first < 0 ? 0 : 1 / (first + 1));
    const grade = (id: string) =>
      label.relevanceGrades?.[id] ?? (relevant.has(id) ? 1 : 0);
    const dcg = ranking
      .slice(0, 10)
      .reduce(
        (sum, id, index) => sum + (2 ** grade(id) - 1) / Math.log2(index + 2),
        0,
      );
    const ideal = [
      ...new Set([
        ...label.relevantChunkIds,
        ...Object.keys(label.relevanceGrades ?? {}),
      ]),
    ]
      .map(grade)
      .sort((a, b) => b - a)
      .slice(0, 10)
      .reduce(
        (sum, value, index) => sum + (2 ** value - 1) / Math.log2(index + 2),
        0,
      );
    ndcgs.push(ideal ? dcg / ideal : 0);
  }
  return {
    recallAtK: mean(recalls),
    mrr: mean(reciprocalRanks),
    ndcgAt10: mean(ndcgs),
    queryCount: labels.length,
  };
}
