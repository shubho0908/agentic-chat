export interface RetrievalCandidate {
  content: string;
  score: number;
  metadata: {
    attachmentId: string;
    fileName: string;
    page?: number;
    chunkId?: string;
    charStart?: number;
  };
}

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "how",
  "i",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "this",
  "to",
  "was",
  "what",
  "when",
  "where",
  "which",
  "who",
  "why",
  "with",
  "you",
  "your",
]);

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

export function candidateKey(candidate: RetrievalCandidate): string {
  if (candidate.metadata.chunkId) return candidate.metadata.chunkId;
  const normalizedContent = normalizeText(candidate.content).slice(0, 200);
  const page = candidate.metadata.page ?? "";
  const charStart = candidate.metadata.charStart ?? "";
  return `${candidate.metadata.attachmentId}:${page}:${charStart}:${normalizedContent}`;
}

export function extractQueryTerms(query: string, maxTerms = 8): string[] {
  const seen = new Set<string>();
  const tokens = query
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter(
      (token) =>
        token.length > 0 &&
        (token.length >= 3 || (token.length >= 2 && /\d/.test(token))) &&
        !STOP_WORDS.has(token),
    );
  const selected: string[] = [];
  for (const token of tokens) {
    if (seen.has(token)) continue;
    seen.add(token);
    selected.push(token);
    if (selected.length >= maxTerms) break;
  }
  return selected;
}

export function computeAdaptiveSimilarityThreshold(params: {
  baseThreshold: number;
  minThreshold: number;
  candidateCount: number;
  limit: number;
}): number {
  const { baseThreshold, minThreshold, candidateCount, limit } = params;
  const ratio = candidateCount / Math.max(1, limit);
  if (ratio >= 2) return clamp(baseThreshold, minThreshold, 1);
  const drop = ratio >= 1 ? 0.1 : ratio >= 0.5 ? 0.18 : 0.25;
  return clamp(baseThreshold - drop, minThreshold, 1);
}

export function dedupeCandidates(
  candidates: RetrievalCandidate[],
): RetrievalCandidate[] {
  const deduped: RetrievalCandidate[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const key = candidateKey(candidate);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(candidate);
  }
  return deduped;
}

/** Reciprocal-rank fusion combines rankings without pretending their raw scores
 * are calibrated. A candidate appearing in several lists accumulates evidence. */
export function reciprocalRankFuse(
  rankings: RetrievalCandidate[][],
  options: { k?: number; limit?: number } = {},
): RetrievalCandidate[] {
  const k = options.k ?? 60;
  const byKey = new Map<
    string,
    { candidate: RetrievalCandidate; score: number; bestRank: number }
  >();
  for (const ranking of rankings) {
    dedupeCandidates(ranking).forEach((candidate, index) => {
      const key = candidateKey(candidate);
      const current = byKey.get(key);
      const contribution = 1 / (k + index + 1);
      if (current) {
        current.score += contribution;
        current.bestRank = Math.min(current.bestRank, index);
      } else {
        byKey.set(key, { candidate, score: contribution, bestRank: index });
      }
    });
  }
  return [...byKey.values()]
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.bestRank - b.bestRank ||
        candidateKey(a.candidate).localeCompare(candidateKey(b.candidate)),
    )
    .slice(0, options.limit)
    .map(({ candidate, score }) => ({ ...candidate, score }));
}

function sortByScoreDesc(
  candidates: RetrievalCandidate[],
): RetrievalCandidate[] {
  return candidates.toSorted((a, b) => b.score - a.score);
}

export function diversifyCandidates(
  candidates: RetrievalCandidate[],
  options: {
    limit: number;
    maxPerAttachment: number;
    minPerAttachment?: number;
  },
): RetrievalCandidate[] {
  const limit = Math.max(1, options.limit);
  const maxPerAttachment = Math.max(1, options.maxPerAttachment);
  const minPerAttachment = Math.max(0, options.minPerAttachment ?? 0);
  const sortedCandidates = sortByScoreDesc(dedupeCandidates(candidates));
  if (sortedCandidates.length <= limit && minPerAttachment === 0)
    return sortedCandidates;

  const byAttachment = new Map<string, RetrievalCandidate[]>();
  for (const candidate of sortedCandidates) {
    const grouped = byAttachment.get(candidate.metadata.attachmentId) ?? [];
    grouped.push(candidate);
    byAttachment.set(candidate.metadata.attachmentId, grouped);
  }
  const attachmentOrder = [...byAttachment.entries()]
    .sort((a, b) => (b[1][0]?.score ?? 0) - (a[1][0]?.score ?? 0))
    .map(([attachmentId]) => attachmentId);
  const selected: RetrievalCandidate[] = [];
  const selectedKeys = new Set<string>();
  const selectedPerAttachment = new Map<string, number>();
  if (minPerAttachment > 0) {
    for (const attachmentId of attachmentOrder) {
      const group = byAttachment.get(attachmentId) ?? [];
      for (
        let i = 0;
        i < Math.min(minPerAttachment, group.length) && selected.length < limit;
        i++
      ) {
        const candidate = group[i];
        const key = candidateKey(candidate);
        if (selectedKeys.has(key)) continue;
        selected.push(candidate);
        selectedKeys.add(key);
        selectedPerAttachment.set(
          attachmentId,
          (selectedPerAttachment.get(attachmentId) ?? 0) + 1,
        );
      }
      if (selected.length >= limit) return selected;
    }
  }
  for (const candidate of sortedCandidates) {
    if (selected.length >= limit) break;
    const key = candidateKey(candidate);
    if (selectedKeys.has(key)) continue;
    const count =
      selectedPerAttachment.get(candidate.metadata.attachmentId) ?? 0;
    if (count >= maxPerAttachment) continue;
    selected.push(candidate);
    selectedKeys.add(key);
    selectedPerAttachment.set(candidate.metadata.attachmentId, count + 1);
  }
  for (const candidate of sortedCandidates) {
    if (selected.length >= limit) break;
    const key = candidateKey(candidate);
    if (selectedKeys.has(key)) continue;
    selected.push(candidate);
    selectedKeys.add(key);
  }
  return selected;
}
