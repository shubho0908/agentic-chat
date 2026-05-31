import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { dispatchCustomEvent } from "@langchain/core/callbacks/dispatch";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import type { ResearchStateType, ResearchSource, ResearchClaim } from "./state";
import {
  TRIAGE_PROMPT,
  DECOMPOSE_PROMPT,
  QUERY_PLANNER_PROMPT,
  EVALUATOR_PROMPT,
  SYNTHESIZER_PROMPT,
  REFLEXION_PROMPT,
} from "./prompts";
import { ResearchStep, Limit, DomainScore } from "./constants";
import { CustomEventName } from "@/lib/orchestrator/constants";
import { scoreSource, getRankedSources, extractDomain } from "./scoring";
import { exaDeepSearch } from "@/lib/tools/exa";
import { scrapeContent } from "@/lib/tools/scrape";
import { getSupportedTemperature } from "@/lib/modelPolicy";

const SHORT_LLM_TIMEOUT_MS = 30_000;
const LONG_LLM_TIMEOUT_MS = 60_000;

function parseJsonSafe<T>(text: string, fallback: T): T {
  try {
    return JSON.parse(text.replace(/```json?\n?|\n?```/g, "").trim()) as T;
  } catch {
    return fallback;
  }
}

function extractLLMText(content: unknown): string {
  return typeof content === "string" ? content : "";
}

async function scrapeWithTimeout(url: string): Promise<string | null> {
  try {
    const result = await Promise.race([
      scrapeContent(url),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), Limit.SCRAPE_TIMEOUT_MS)
      ),
    ]);
    return result.length > 50 ? result : null;
  } catch {
    return null;
  }
}

function emitProgress(
  step: string,
  detail: string,
  config: LangGraphRunnableConfig | undefined,
  extra?: Record<string, unknown>
) {
  return dispatchCustomEvent(CustomEventName.RESEARCH_PROGRESS, { step, detail, ...extra }, config ?? {});
}

interface ResearchImage {
  url: string;
  description?: string;
}

function collectImages(sources: ResearchSource[], limit: number): ResearchImage[] {
  const seen = new Set<string>();
  const images: ResearchImage[] = [];
  for (const source of getRankedSources(sources, sources.length)) {
    if (!source.image || seen.has(source.image)) continue;
    seen.add(source.image);
    images.push({ url: source.image, description: source.title });
    if (images.length >= limit) break;
  }
  return images;
}

export function triageNode(apiKey: string, model: string) {
  const llm = new ChatOpenAI({ modelName: model, apiKey, maxTokens: 256, temperature: getSupportedTemperature(model, 0), streaming: false, timeout: SHORT_LLM_TIMEOUT_MS });

  return async (state: ResearchStateType, config?: LangGraphRunnableConfig) => {
    if (state.userContext) {
      return { clarificationQuestions: [] };
    }

    await emitProgress(ResearchStep.TRIAGING, "Analyzing research scope...", config);

    const response = await llm.invoke(
      [new SystemMessage(TRIAGE_PROMPT), new HumanMessage(state.query)],
      config
    );

    const result = parseJsonSafe<{
      needsClarification?: boolean;
      confidence?: number;
      questions?: string[];
    }>(extractLLMText(response.content), { needsClarification: false, confidence: 1 });

    const needsClarification =
      result.needsClarification === true &&
      (result.confidence ?? 1) < Limit.CLARIFICATION_THRESHOLD &&
      Array.isArray(result.questions) &&
      result.questions.length > 0;

    return {
      clarificationQuestions: needsClarification ? result.questions!.slice(0, 2) : [],
    };
  };
}

export function decomposeNode(apiKey: string, model: string) {
  const llm = new ChatOpenAI({ modelName: model, apiKey, maxTokens: 512, temperature: getSupportedTemperature(model, 0), streaming: false, timeout: SHORT_LLM_TIMEOUT_MS });

  return async (state: ResearchStateType, config?: LangGraphRunnableConfig) => {
    await emitProgress(ResearchStep.DECOMPOSING, "Breaking down research question...", config);

    const enrichedQuery = state.userContext
      ? `${state.query}\n\nAdditional context from user: ${state.userContext}`
      : state.query;

    const response = await llm.invoke(
      [new SystemMessage(DECOMPOSE_PROMPT), new HumanMessage(enrichedQuery)],
      config
    );

    const subQuestions = parseJsonSafe<string[]>(
      extractLLMText(response.content),
      [state.query]
    ).slice(0, Limit.MAX_SUB_QUESTIONS);

    await emitProgress(ResearchStep.DECOMPOSING, `Identified ${subQuestions.length} research angles`, config);
    return { subQuestions };
  };
}

export function planQueriesNode(apiKey: string, model: string) {
  const llm = new ChatOpenAI({ modelName: model, apiKey, maxTokens: 512, temperature: getSupportedTemperature(model, 0), streaming: false, timeout: SHORT_LLM_TIMEOUT_MS });

  return async (state: ResearchStateType, config?: LangGraphRunnableConfig) => {
    const queryGroups = await Promise.all(
      state.subQuestions.map(async (subQ) => {
        const response = await llm.invoke(
          [new SystemMessage(QUERY_PLANNER_PROMPT), new HumanMessage(subQ)],
          config
        );
        const queries = parseJsonSafe<string[]>(extractLLMText(response.content), [subQ]);
        return queries.slice(0, Limit.MAX_QUERIES_PER_SUB);
      })
    );
    const allQueries = queryGroups.flat();

    await emitProgress(
      ResearchStep.PLANNING,
      `Generated ${allQueries.length} search queries across ${state.subQuestions.length} angles`,
      config
    );
    return { searchQueries: allQueries };
  };
}

export function searchNode() {
  return async (state: ResearchStateType, config?: LangGraphRunnableConfig) => {
    const { searchQueries, searchRound } = state;
    const nextRound = searchRound + 1;

    if (!process.env.EXA_API_KEY) {
      await emitProgress(ResearchStep.SEARCHING, "EXA_API_KEY not configured — skipping web search", config);
      return { sources: [], searchRound: nextRound };
    }

    await emitProgress(ResearchStep.SEARCHING, `Executing ${searchQueries.length} searches (round ${nextRound})...`, config);

    const results = await Promise.allSettled(
      searchQueries.map((query) => exaDeepSearch(query, { numResults: 8, maxCharacters: 3000 }))
    );

    const newSources: ResearchSource[] = [];
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status !== "fulfilled") continue;
      const query = searchQueries[i];

      for (const item of result.value) {
        if (!item.url || !item.text) continue;
        const source: ResearchSource = {
          title: item.title,
          url: item.url,
          snippet: item.text.slice(0, Limit.MAX_SNIPPET_LEN),
          domain: extractDomain(item.url),
          qualityScore: 0,
          queryOrigin: query,
          publishedDate: item.publishedDate,
          image: item.image,
        };
        source.qualityScore = scoreSource(source);
        newSources.push(source);
      }
    }

    await emitProgress(ResearchStep.SEARCHING, `Found ${newSources.length} new sources in round ${nextRound}`, config);
    return { sources: newSources, searchRound: nextRound };
  };
}

export function deepScrapeNode() {
  return async (state: ResearchStateType, config?: LangGraphRunnableConfig) => {
    const toScrape = [...state.sources]
      .map((s) => ({ ...s, qualityScore: scoreSource(s) }))
      .sort((a, b) => b.qualityScore - a.qualityScore)
      .filter((s) => !s.fullContent)
      .slice(0, Limit.TOP_SCRAPE_COUNT);

    if (toScrape.length === 0) return { sources: [] };

    await emitProgress(ResearchStep.DEEP_SCRAPING, `Deep-scraping ${toScrape.length} top sources...`, config);

    const scrapeResults = await Promise.allSettled(
      toScrape.map((s) => scrapeWithTimeout(s.url))
    );

    const updatedSources: ResearchSource[] = [];
    for (let i = 0; i < toScrape.length; i++) {
      const r = scrapeResults[i];
      if (r.status === "fulfilled" && r.value) {
        updatedSources.push({
          ...toScrape[i],
          fullContent: r.value.slice(0, Limit.MAX_FULL_CONTENT_LEN),
          qualityScore: toScrape[i].qualityScore + DomainScore.FULL_CONTENT_BONUS,
        });
      }
    }

    return { sources: updatedSources };
  };
}

export function evaluateNode(apiKey: string, model: string) {
  const llm = new ChatOpenAI({ modelName: model, apiKey, maxTokens: 768, temperature: getSupportedTemperature(model, 0), streaming: false, timeout: SHORT_LLM_TIMEOUT_MS });

  return async (state: ResearchStateType, config?: LangGraphRunnableConfig) => {
    if (state.searchRound >= state.maxRounds || state.sources.length >= Limit.MAX_SOURCES) {
      return { searchQueries: [], gaps: [] };
    }

    const topSources = getRankedSources(state.sources, 12);
    const sourceSummary = topSources
      .map((s, i) => `[${i + 1}] (score:${s.qualityScore}) ${s.title} [${s.domain}]: ${(s.fullContent ?? s.snippet).slice(0, 250)}`)
      .join("\n");

    const response = await llm.invoke(
      [
        new SystemMessage(EVALUATOR_PROMPT),
        new HumanMessage(
          `Original query: ${state.query}\n\nSub-questions: ${state.subQuestions.join("; ")}\n\nSources (${state.sources.length} total, top 12):\n${sourceSummary}\n\nPrevious gaps: ${state.gaps.join(", ") || "none"}`
        ),
      ],
      config
    );

    const evaluation = parseJsonSafe<{
      sufficient?: boolean;
      gaps?: string[];
      followUpQueries?: string[];
    }>(extractLLMText(response.content), { sufficient: true });

    if (evaluation.sufficient || !evaluation.followUpQueries?.length) {
      await emitProgress(ResearchStep.EVALUATING, `Coverage sufficient — ${state.sources.length} sources across ${state.searchRound} rounds`, config);
      return { searchQueries: [], gaps: evaluation.gaps ?? [] };
    }

    await emitProgress(ResearchStep.EVALUATING, `Gaps: ${evaluation.gaps?.join(", ")}. Refining...`, config);
    return {
      searchQueries: evaluation.followUpQueries.slice(0, Limit.MAX_FOLLOW_UP_QUERIES),
      gaps: evaluation.gaps ?? [],
    };
  };
}

export function synthesizeNode(apiKey: string, model: string) {
  const llm = new ChatOpenAI({ modelName: model, apiKey, maxTokens: 4096, temperature: getSupportedTemperature(model, 0.1), streaming: false, timeout: LONG_LLM_TIMEOUT_MS });

  return async (state: ResearchStateType, config?: LangGraphRunnableConfig) => {
    const images = collectImages(state.sources, Limit.MAX_RESEARCH_IMAGES);
    await emitProgress(
      ResearchStep.SYNTHESIZING,
      `Synthesizing ${state.sources.length} sources...`,
      config,
      images.length > 0 ? { images } : undefined
    );

    const ranked = getRankedSources(state.sources, Limit.MAX_RANKED_SOURCES);
    const sourcesText = ranked
      .map((s, i) => `[Source ${i + 1}] ${s.title}\nDomain: ${s.domain} | Quality: ${s.qualityScore}/20\nURL: ${s.url}\n${(s.fullContent ?? s.snippet).slice(0, 1500)}`)
      .join("\n\n---\n\n");

    const response = await llm.invoke(
      [
        new SystemMessage(SYNTHESIZER_PROMPT),
        new HumanMessage(
          `Research query: ${state.query}\n\nSub-questions: ${state.subQuestions.join("; ")}\n\nRanked sources (${ranked.length}/${state.sources.length}):\n${sourcesText}`
        ),
      ],
      config
    );

    return { synthesis: extractLLMText(response.content) };
  };
}

export function reflexionNode(apiKey: string, model: string) {
  const llm = new ChatOpenAI({ modelName: model, apiKey, maxTokens: 1024, temperature: getSupportedTemperature(model, 0), streaming: false, timeout: SHORT_LLM_TIMEOUT_MS });

  return async (state: ResearchStateType, config?: LangGraphRunnableConfig) => {
    await emitProgress(ResearchStep.VERIFYING, "Fact-checking synthesis against sources...", config);

    const topSources = getRankedSources(state.sources, 10);
    const sourcesRef = topSources
      .map((s, i) => `[Source ${i + 1}] ${s.title}: ${(s.fullContent ?? s.snippet).slice(0, 400)}`)
      .join("\n");

    const response = await llm.invoke(
      [
        new SystemMessage(REFLEXION_PROMPT),
        new HumanMessage(`Synthesis to verify:\n${state.synthesis}\n\nSources:\n${sourcesRef}`),
      ],
      config
    );

    const audit = parseJsonSafe<{
      passed?: boolean;
      claims?: ResearchClaim[];
      issues?: string[];
    }>(extractLLMText(response.content), { passed: true });

    if (audit.passed) {
      await emitProgress(ResearchStep.VERIFIED, "Synthesis passed fact-check ✓", config);
      return { reflexionPassed: true, claims: audit.claims ?? [] };
    }

    await emitProgress(ResearchStep.CORRECTING, `${audit.issues?.length ?? 0} issues found — correcting...`, config);
    return { reflexionPassed: false, claims: audit.claims ?? [], gaps: audit.issues ?? [] };
  };
}

export function correctNode(apiKey: string, model: string) {
  const llm = new ChatOpenAI({ modelName: model, apiKey, maxTokens: 4096, temperature: getSupportedTemperature(model, 0), streaming: false, timeout: LONG_LLM_TIMEOUT_MS });

  return async (state: ResearchStateType, config?: LangGraphRunnableConfig) => {
    const topSources = getRankedSources(state.sources, 12);
    const sourcesRef = topSources
      .map((s, i) => `[Source ${i + 1}] ${s.title} (${s.domain}): ${(s.fullContent ?? s.snippet).slice(0, 800)}`)
      .join("\n\n");

    const response = await llm.invoke(
      [
        new SystemMessage(SYNTHESIZER_PROMPT),
        new HumanMessage(
          `Research query: ${state.query}\n\nPREVIOUS ISSUES TO FIX:\n- ${state.gaps.join("\n- ")}\n\nCORRECTION: Remove unsourced claims. Add [Source N] to every fact. State "could not be verified" for unconfirmable info.\n\nSources:\n${sourcesRef}`
        ),
      ],
      config
    );

    return { synthesis: extractLLMText(response.content), reflexionPassed: true };
  };
}
