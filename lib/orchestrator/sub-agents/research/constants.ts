export const ResearchNode = {
  TRIAGE: "triage",
  DECOMPOSE: "decompose",
  PLAN_QUERIES: "plan_queries",
  SEARCH: "search",
  EVALUATE: "evaluate",
  DEEP_SCRAPE: "deep_scrape",
  SYNTHESIZE: "synthesize",
  REFLEXION: "reflexion",
  CORRECT: "correct",
} as const;
export type ResearchNodeValue = (typeof ResearchNode)[keyof typeof ResearchNode];

export const ResearchStep = {
  TRIAGING: "triaging",
  DECOMPOSING: "decomposing",
  PLANNING: "planning",
  SEARCHING: "searching",
  DEEP_SCRAPING: "deep_scraping",
  EVALUATING: "evaluating",
  SYNTHESIZING: "synthesizing",
  VERIFYING: "verifying",
  CORRECTING: "correcting",
  VERIFIED: "verified",
} as const;

export const Limit = {
  MAX_SEARCH_ROUNDS: 6,
  MAX_SOURCES: 30,
  MAX_SOURCES_PER_DOMAIN: 3,
  SCRAPE_TIMEOUT_MS: 15_000,
  SCRAPE_RETRIES: 2,
  TOP_SCRAPE_COUNT: 6,
  MAX_SUB_QUESTIONS: 4,
  MAX_QUERIES_PER_SUB: 3,
  MAX_FOLLOW_UP_QUERIES: 3,
  MAX_RANKED_SOURCES: 15,
  MAX_SNIPPET_LEN: 800,
  MAX_FULL_CONTENT_LEN: 3000,
  RECURSION_LIMIT: 40,
  CLARIFICATION_THRESHOLD: 0.4,
  MAX_RESEARCH_IMAGES: 12,
  MAX_CORRECTION_ATTEMPTS: 2,
  MAX_TOKEN_BUDGET: 60_000,
} as const;

export const DomainScore = {
  HIGH: 10,
  MEDIUM: 6,
  ORG_EDU: 7,
  DEFAULT: 3,
  FULL_CONTENT_BONUS: 5,
  LONG_CONTENT_BONUS: 3,
  SHORT_CONTENT_BONUS: 1,
  RECENCY_2025: 4,
  RECENCY_2024: 2,
} as const;

export const CLARIFICATION_PREFIX = "CLARIFICATION_NEEDED:" as const;
