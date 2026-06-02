import type { ResearchSource } from "./state";
import { DomainScore, Limit } from "./constants";

const HIGH_AUTHORITY_DOMAINS = new Set([
  "github.com", "stackoverflow.com", "developer.mozilla.org", "docs.google.com",
  "arxiv.org", "nature.com", "science.org", "ieee.org", "acm.org",
  "nytimes.com", "reuters.com", "bbc.com", "apnews.com",
  "docs.aws.amazon.com", "cloud.google.com", "learn.microsoft.com",
  "vercel.com", "nextjs.org", "react.dev", "nodejs.org",
  "postgresql.org", "redis.io", "kubernetes.io", "docker.com",
]);

const MEDIUM_AUTHORITY_PATTERNS = [
  /\.gov$/, /\.ac\./,
  /medium\.com/, /dev\.to/, /hashnode\./,
  /blog\..+\.(com|io|dev)$/,
];

function scoreDomainAuthority(domain: string): number {
  if (HIGH_AUTHORITY_DOMAINS.has(domain)) return DomainScore.HIGH;
  if (domain.endsWith(".org") || domain.endsWith(".edu")) return DomainScore.ORG_EDU;
  if (MEDIUM_AUTHORITY_PATTERNS.some((p) => p.test(domain))) return DomainScore.MEDIUM;
  return DomainScore.DEFAULT;
}

export function scoreSource(source: ResearchSource): number {
  let score = scoreDomainAuthority(source.domain);
  const contentLen = (source.fullContent ?? source.snippet).length;
  if (contentLen > 1000) score += DomainScore.LONG_CONTENT_BONUS;
  else if (contentLen > 500) score += DomainScore.SHORT_CONTENT_BONUS;
  if (source.publishedDate) {
    const year = parseInt(source.publishedDate.slice(0, 4), 10);
    if (year >= 2025) score += DomainScore.RECENCY_2025;
    else if (year >= 2024) score += DomainScore.RECENCY_2024;
  }
  return score;
}

export function getRankedSources(sources: ResearchSource[], limit: number): ResearchSource[] {
  const perDomain = new Map<string, number>();
  const ranked: ResearchSource[] = [];

  for (const source of [...sources].sort((a, b) => b.qualityScore - a.qualityScore)) {
    const domain = source.domain || "unknown";
    const count = perDomain.get(domain) ?? 0;
    if (count >= Limit.MAX_SOURCES_PER_DOMAIN) {
      continue;
    }

    perDomain.set(domain, count + 1);
    ranked.push(source);
    if (ranked.length >= limit) {
      break;
    }
  }

  return ranked;
}
