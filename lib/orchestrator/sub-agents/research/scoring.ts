import type { ResearchSource } from "./state";
import { DomainScore } from "./constants";

const HIGH_AUTHORITY_DOMAINS = new Set([
  "github.com", "stackoverflow.com", "developer.mozilla.org", "docs.google.com",
  "arxiv.org", "nature.com", "science.org", "ieee.org", "acm.org",
  "nytimes.com", "reuters.com", "bbc.com", "apnews.com",
  "docs.aws.amazon.com", "cloud.google.com", "learn.microsoft.com",
  "vercel.com", "nextjs.org", "react.dev", "nodejs.org",
  "postgresql.org", "redis.io", "kubernetes.io", "docker.com",
]);

const MEDIUM_AUTHORITY_PATTERNS = [
  /\.gov$/, /\.edu$/, /\.ac\./,
  /medium\.com/, /dev\.to/, /hashnode\./,
  /blog\..+\.(com|io|dev)$/,
];

export function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function scoreDomainAuthority(domain: string): number {
  if (HIGH_AUTHORITY_DOMAINS.has(domain)) return DomainScore.HIGH;
  if (MEDIUM_AUTHORITY_PATTERNS.some((p) => p.test(domain))) return DomainScore.MEDIUM;
  if (domain.endsWith(".org") || domain.endsWith(".edu")) return DomainScore.ORG_EDU;
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
  return [...sources]
    .sort((a, b) => b.qualityScore - a.qualityScore)
    .slice(0, limit);
}
