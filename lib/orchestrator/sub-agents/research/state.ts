import { Annotation } from "@langchain/langgraph";
import { Limit } from "./constants";

export interface ResearchSource {
  url: string;
  title: string;
  snippet: string;
  fullContent?: string;
  qualityScore: number;
  domain: string;
  publishedDate?: string;
  queryOrigin: string;
  image?: string;
}

export interface ResearchClaim {
  claim: string;
  supportedBy: number[];
  confidence: "high" | "medium" | "low" | "unsupported";
}

export interface ResearchTokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  llmCalls: number;
}

function emptyTokenUsage(): ResearchTokenUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    llmCalls: 0,
  };
}

function mergeTokenUsage(current: ResearchTokenUsage, update: ResearchTokenUsage): ResearchTokenUsage {
  return {
    inputTokens: current.inputTokens + update.inputTokens,
    outputTokens: current.outputTokens + update.outputTokens,
    totalTokens: current.totalTokens + update.totalTokens,
    llmCalls: current.llmCalls + update.llmCalls,
  };
}

function enforceDomainDiversity(sources: ResearchSource[]): ResearchSource[] {
  const perDomain = new Map<string, number>();
  const diverse: ResearchSource[] = [];

  for (const source of sources.toSorted((a, b) => b.qualityScore - a.qualityScore)) {
    const domain = source.domain || "unknown";
    const count = perDomain.get(domain) ?? 0;
    if (count >= Limit.MAX_SOURCES_PER_DOMAIN) {
      continue;
    }

    perDomain.set(domain, count + 1);
    diverse.push(source);
    if (diverse.length >= Limit.MAX_SOURCES) {
      break;
    }
  }

  return diverse;
}

export const ResearchState = Annotation.Root({
  query: Annotation<string>,
  userContext: Annotation<string>({
    reducer: (_current, update) => update,
    default: () => "",
  }),
  subQuestions: Annotation<string[]>({
    reducer: (_current, update) => update,
    default: () => [],
  }),
  searchQueries: Annotation<string[]>({
    reducer: (_current, update) => update,
    default: () => [],
  }),
  searchedQueries: Annotation<string[]>({
    reducer: (current, update) => {
      const seen = new Set(current);
      for (const query of update) {
        if (query) {
          seen.add(query);
        }
      }
      return [...seen];
    },
    default: () => [],
  }),
  sources: Annotation<ResearchSource[]>({
    reducer: (current, update) => {
      const map = new Map(current.map((s) => [s.url, s]));
      for (const s of update) {
        const existing = map.get(s.url);
        if (existing) {
          map.set(s.url, {
            ...existing,
            ...s,
            snippet: s.snippet.length > existing.snippet.length ? s.snippet : existing.snippet,
            fullContent: s.fullContent ?? existing.fullContent,
            qualityScore: Math.max(s.qualityScore, existing.qualityScore),
          });
        } else {
          map.set(s.url, s);
        }
      }
      return enforceDomainDiversity([...map.values()]);
    },
    default: () => [],
  }),
  claims: Annotation<ResearchClaim[]>({
    reducer: (_current, update) => update,
    default: () => [],
  }),
  synthesis: Annotation<string>({
    reducer: (_current, update) => update,
    default: () => "",
  }),
  searchRound: Annotation<number>({
    reducer: (_current, update) => update,
    default: () => 0,
  }),
  maxRounds: Annotation<number>({
    reducer: (_current, update) => update,
    default: () => 6,
  }),
  gaps: Annotation<string[]>({
    reducer: (_current, update) => update,
    default: () => [],
  }),
  reflexionPassed: Annotation<boolean>({
    reducer: (_current, update) => update,
    default: () => false,
  }),
  correctionAttempts: Annotation<number>({
    reducer: (_current, update) => update,
    default: () => 0,
  }),
  tokenUsage: Annotation<ResearchTokenUsage>({
    reducer: (current, update) => mergeTokenUsage(current, update),
    default: emptyTokenUsage,
  }),
  tokenBudget: Annotation<number>({
    reducer: (_current, update) => update,
    default: () => Limit.MAX_TOKEN_BUDGET,
  }),
  clarificationQuestions: Annotation<string[]>({
    reducer: (_current, update) => update,
    default: () => [],
  }),
});

export type ResearchStateType = typeof ResearchState.State;
