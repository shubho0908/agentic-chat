import { Annotation } from "@langchain/langgraph";

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
      return [...map.values()];
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
  clarificationQuestions: Annotation<string[]>({
    reducer: (_current, update) => update,
    default: () => [],
  }),
});

export type ResearchStateType = typeof ResearchState.State;
