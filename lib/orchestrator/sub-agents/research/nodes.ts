import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { dispatchCustomEvent } from "@langchain/core/callbacks/dispatch";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { z } from "zod";
import type { ResearchStateType, ResearchSource, ResearchClaim } from "./state";
import {
  TRIAGE_PROMPT,
  DECOMPOSE_PROMPT,
  QUERY_PLANNER_PROMPT,
  EVALUATOR_PROMPT,
  SYNTHESIZER_PROMPT,
  REFLEXION_PROMPT,
} from "./prompts";
import { ResearchNode, ResearchStep, Limit, DomainScore } from "./constants";
import { CustomEventName } from "@/lib/orchestrator/constants";
import { scoreSource, getRankedSources } from "./scoring";
import { extractDomain } from "@/lib/utils";
import { exaDeepSearch } from "@/lib/tools/exa";
import { scrapeContent } from "@/lib/tools/scrape";
import { getSupportedTemperature } from "@/lib/modelPolicy";
import { withRetry } from "@/lib/retry";
import { logger } from "@/lib/logger";
import {
  dedupeSearchQueries,
  emptyTokenUsage,
  getAbortSignal,
  invokeResearchJson,
  invokeResearchLLM,
  isAbortError,
  mergeTokenUsage,
  normalizeSearchQuery,
  throwIfAborted,
  withResearchNode,
} from "./runtime";

const SHORT_LLM_TIMEOUT_MS = 30_000;
const LONG_LLM_TIMEOUT_MS = 60_000;

const triageSchema = z.object({
  needsClarification: z.boolean().optional(),
  confidence: z.number().optional(),
  questions: z.array(z.string()).optional(),
});

const stringArraySchema = z.array(z.string());

const evaluationSchema = z.object({
  sufficient: z.boolean().optional(),
  coveredSubQuestions: z.array(z.string()).optional(),
  gaps: z.array(z.string()).optional(),
  followUpQueries: z.array(z.string()).optional(),
});

const claimSchema = z.object({
  claim: z.string(),
  supportedBy: z.array(z.number()),
  confidence: z.enum(["high", "medium", "low", "unsupported"]),
});

const reflexionSchema = z.object({
  passed: z.boolean().optional(),
  claims: z.array(claimSchema).optional(),
  issues: z.array(z.string()).optional(),
  suggestion: z.string().optional(),
});

async function scrapeWithTimeout(
  url: string,
  config?: LangGraphRunnableConfig
): Promise<string | null> {
  try {
    const result = await withRetry(
      (signal) =>
        scrapeContent(url, {
          timeoutMs: Limit.SCRAPE_TIMEOUT_MS,
          retries: 1,
          signal,
        }),
      {
        retries: Limit.SCRAPE_RETRIES,
        initialDelayMs: 500,
        timeoutMs: Limit.SCRAPE_TIMEOUT_MS,
        signal: getAbortSignal(config),
      }
    );
    return result.length > 50 ? result : null;
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
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

  return withResearchNode(ResearchNode.TRIAGE, async (state: ResearchStateType, config?: LangGraphRunnableConfig) => {
    if (state.userContext) {
      return { clarificationQuestions: [] };
    }

    await emitProgress(ResearchStep.TRIAGING, "Analyzing research scope...", config);

    const { value: result, tokenUsage } = await invokeResearchJson(
      llm,
      [new SystemMessage(TRIAGE_PROMPT), new HumanMessage(state.query)],
      {
        nodeName: ResearchNode.TRIAGE,
        state,
        config,
        maxOutputTokens: 256,
        timeoutMs: SHORT_LLM_TIMEOUT_MS,
        schema: triageSchema,
        fallback: { needsClarification: false, confidence: 1 },
        schemaDescription:
          '{"needsClarification": boolean, "confidence": number, "questions": string[]}',
      }
    );

    const needsClarification =
      result.needsClarification === true &&
      (result.confidence ?? 1) < Limit.CLARIFICATION_THRESHOLD &&
      Array.isArray(result.questions) &&
      result.questions.length > 0;

    return {
      clarificationQuestions: needsClarification ? result.questions!.slice(0, 2) : [],
      tokenUsage,
    };
  });
}

export function decomposeNode(apiKey: string, model: string) {
  const llm = new ChatOpenAI({ modelName: model, apiKey, maxTokens: 512, temperature: getSupportedTemperature(model, 0), streaming: false, timeout: SHORT_LLM_TIMEOUT_MS });

  return withResearchNode(ResearchNode.DECOMPOSE, async (state: ResearchStateType, config?: LangGraphRunnableConfig) => {
    await emitProgress(ResearchStep.DECOMPOSING, "Breaking down research question...", config);

    const enrichedQuery = state.userContext
      ? `${state.query}\n\nAdditional context from user: ${state.userContext}`
      : state.query;

    const { value, tokenUsage } = await invokeResearchJson(
      llm,
      [new SystemMessage(DECOMPOSE_PROMPT), new HumanMessage(enrichedQuery)],
      {
        nodeName: ResearchNode.DECOMPOSE,
        state,
        config,
        maxOutputTokens: 512,
        timeoutMs: SHORT_LLM_TIMEOUT_MS,
        schema: stringArraySchema,
        fallback: [state.query],
        schemaDescription: '["searchable sub-question", "..."]',
      }
    );
    const subQuestions = value
      .filter((question) => question.trim().length > 0)
      .slice(0, Limit.MAX_SUB_QUESTIONS);

    await emitProgress(ResearchStep.DECOMPOSING, `Identified ${subQuestions.length} research angles`, config);
    return { subQuestions: subQuestions.length > 0 ? subQuestions : [state.query], tokenUsage };
  });
}

export function planQueriesNode(apiKey: string, model: string) {
  const llm = new ChatOpenAI({ modelName: model, apiKey, maxTokens: 512, temperature: getSupportedTemperature(model, 0), streaming: false, timeout: SHORT_LLM_TIMEOUT_MS });

  return withResearchNode(ResearchNode.PLAN_QUERIES, async (state: ResearchStateType, config?: LangGraphRunnableConfig) => {
    const queryGroups = await Promise.all(
      state.subQuestions.map(async (subQ) => {
        const result = await invokeResearchJson(
          llm,
          [new SystemMessage(QUERY_PLANNER_PROMPT), new HumanMessage(subQ)],
          {
            nodeName: ResearchNode.PLAN_QUERIES,
            state,
            config,
            maxOutputTokens: 512,
            timeoutMs: SHORT_LLM_TIMEOUT_MS,
            schema: stringArraySchema,
            fallback: [subQ],
            schemaDescription: '["precise search query", "..."]',
          }
        );
        return {
          queries: result.value.slice(0, Limit.MAX_QUERIES_PER_SUB),
          tokenUsage: result.tokenUsage,
        };
      })
    );
    const allQueries = dedupeSearchQueries(
      queryGroups.flatMap((group) => group.queries),
      state.searchedQueries
    );
    const tokenUsage = mergeTokenUsage(...queryGroups.map((group) => group.tokenUsage));

    await emitProgress(
      ResearchStep.PLANNING,
      `Generated ${allQueries.length} search queries across ${state.subQuestions.length} angles`,
      config
    );
    return { searchQueries: allQueries, tokenUsage };
  });
}

export function searchNode() {
  return withResearchNode(ResearchNode.SEARCH, async (state: ResearchStateType, config?: LangGraphRunnableConfig) => {
    const { searchQueries, searchRound } = state;
    const nextRound = searchRound + 1;
    const queriesToSearch = dedupeSearchQueries(searchQueries, state.searchedQueries);

    if (queriesToSearch.length === 0) {
      await emitProgress(ResearchStep.SEARCHING, "No new search queries to execute", config);
      return { sources: [], searchQueries: [], searchedQueries: [], searchRound: nextRound };
    }

    if (!process.env.EXA_API_KEY && !process.env.SERPER_API_KEY) {
      await emitProgress(ResearchStep.SEARCHING, "No search provider configured - skipping web search", config);
      return { sources: [], searchQueries: [], searchRound: nextRound };
    }

    await emitProgress(ResearchStep.SEARCHING, `Executing ${queriesToSearch.length} searches (round ${nextRound})...`, config);

    const results = await Promise.allSettled(
      queriesToSearch.map((query) => {
        throwIfAborted(config);
        return exaDeepSearch(query, {
          numResults: 8,
          maxCharacters: 3000,
          signal: getAbortSignal(config),
        });
      })
    );

    const newSources: ResearchSource[] = [];
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === "rejected") {
        if (isAbortError(result.reason)) {
          throw result.reason;
        }
        logger.warn("[ResearchSearch] Query failed:", {
          query: queriesToSearch[i],
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        });
        continue;
      }
      const query = queriesToSearch[i];

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
    return {
      sources: newSources,
      searchQueries: [],
      searchedQueries: queriesToSearch.map(normalizeSearchQuery),
      searchRound: nextRound,
    };
  });
}

export function deepScrapeNode() {
  return withResearchNode(ResearchNode.DEEP_SCRAPE, async (state: ResearchStateType, config?: LangGraphRunnableConfig) => {
    const toScrape = getRankedSources(
      state.sources
        .flatMap((s) => {
          if (s.fullContent) return [];
          return [{ ...s, qualityScore: scoreSource(s) }];
        }),
      Limit.TOP_SCRAPE_COUNT
    );

    if (toScrape.length === 0) return { sources: [] };

    await emitProgress(ResearchStep.DEEP_SCRAPING, `Deep-scraping ${toScrape.length} top sources...`, config);

    const scrapeResults = await Promise.allSettled(
      toScrape.map((s) => {
        throwIfAborted(config);
        return scrapeWithTimeout(s.url, config);
      })
    );

    const updatedSources: ResearchSource[] = [];
    for (let i = 0; i < toScrape.length; i++) {
      const r = scrapeResults[i];
      if (r.status === "rejected") {
        if (isAbortError(r.reason)) {
          throw r.reason;
        }
        continue;
      }
      if (r.status === "fulfilled" && r.value) {
        updatedSources.push({
          ...toScrape[i],
          fullContent: r.value.slice(0, Limit.MAX_FULL_CONTENT_LEN),
          qualityScore: toScrape[i].qualityScore + DomainScore.FULL_CONTENT_BONUS,
        });
      }
    }

    return { sources: updatedSources };
  });
}

export function evaluateNode(apiKey: string, model: string) {
  const llm = new ChatOpenAI({ modelName: model, apiKey, maxTokens: 768, temperature: getSupportedTemperature(model, 0), streaming: false, timeout: SHORT_LLM_TIMEOUT_MS });

  return withResearchNode(ResearchNode.EVALUATE, async (state: ResearchStateType, config?: LangGraphRunnableConfig) => {
    if (state.searchRound >= state.maxRounds || state.sources.length >= Limit.MAX_SOURCES) {
      return { searchQueries: [], gaps: [] };
    }

    const topSources = getRankedSources(state.sources, 12);
    const sourceSummary = topSources
      .map((s, i) => `[${i + 1}] (score:${s.qualityScore}) ${s.title} [${s.domain}]: ${(s.fullContent ?? s.snippet).slice(0, 250)}`)
      .join("\n");

    const { value: evaluation, tokenUsage } = await invokeResearchJson(
      llm,
      [
        new SystemMessage(EVALUATOR_PROMPT),
        new HumanMessage(
          `Original query: ${state.query}\n\nSub-questions: ${state.subQuestions.join("; ")}\n\nSources (${state.sources.length} total, top 12):\n${sourceSummary}\n\nPrevious gaps: ${state.gaps.join(", ") || "none"}`
        ),
      ],
      {
        nodeName: ResearchNode.EVALUATE,
        state,
        config,
        maxOutputTokens: 768,
        timeoutMs: SHORT_LLM_TIMEOUT_MS,
        schema: evaluationSchema,
        fallback: { sufficient: true },
        schemaDescription:
          '{"sufficient": boolean, "coveredSubQuestions": string[], "gaps": string[], "followUpQueries": string[]}',
      }
    );

    const followUpQueries = dedupeSearchQueries(
      evaluation.followUpQueries ?? [],
      state.searchedQueries
    ).slice(0, Limit.MAX_FOLLOW_UP_QUERIES);

    if (evaluation.sufficient || followUpQueries.length === 0) {
      await emitProgress(ResearchStep.EVALUATING, `Coverage sufficient - ${state.sources.length} sources across ${state.searchRound} rounds`, config);
      return { searchQueries: [], gaps: evaluation.gaps ?? [], tokenUsage };
    }

    await emitProgress(ResearchStep.EVALUATING, `Gaps: ${evaluation.gaps?.join(", ")}. Refining...`, config);
    return {
      searchQueries: followUpQueries,
      gaps: evaluation.gaps ?? [],
      tokenUsage,
    };
  }, {
    nonCritical: true,
    fallback: async (state, error, config) => {
      await emitProgress(
        ResearchStep.EVALUATING,
        `Evaluation skipped after failure: ${error instanceof Error ? error.message : "unknown error"}`,
        config
      );
      return { searchQueries: [], gaps: state.gaps };
    },
  });
}

export function synthesizeNode(apiKey: string, model: string) {
  const llm = new ChatOpenAI({ modelName: model, apiKey, maxTokens: 4096, temperature: getSupportedTemperature(model, 0.1), streaming: false, timeout: LONG_LLM_TIMEOUT_MS });

  return withResearchNode(ResearchNode.SYNTHESIZE, async (state: ResearchStateType, config?: LangGraphRunnableConfig) => {
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

    const { text, tokenUsage } = await invokeResearchLLM(
      llm,
      [
        new SystemMessage(SYNTHESIZER_PROMPT),
        new HumanMessage(
          `Research query: ${state.query}\n\nSub-questions: ${state.subQuestions.join("; ")}\n\nRanked sources (${ranked.length}/${state.sources.length}):\n${sourcesText}`
        ),
      ],
      {
        nodeName: ResearchNode.SYNTHESIZE,
        state,
        config,
        maxOutputTokens: 4096,
        timeoutMs: LONG_LLM_TIMEOUT_MS,
      }
    );

    return { synthesis: text, tokenUsage };
  });
}

export function reflexionNode(apiKey: string, model: string) {
  const llm = new ChatOpenAI({ modelName: model, apiKey, maxTokens: 1024, temperature: getSupportedTemperature(model, 0), streaming: false, timeout: SHORT_LLM_TIMEOUT_MS });

  return withResearchNode(ResearchNode.REFLEXION, async (state: ResearchStateType, config?: LangGraphRunnableConfig) => {
    if (!state.synthesis.trim()) {
      return { reflexionPassed: true, claims: [] };
    }

    await emitProgress(ResearchStep.VERIFYING, "Fact-checking synthesis against sources...", config);

    const topSources = getRankedSources(state.sources, 10);
    const sourcesRef = topSources
      .map((s, i) => `[Source ${i + 1}] ${s.title}: ${(s.fullContent ?? s.snippet).slice(0, 400)}`)
      .join("\n");

    const { value: audit, tokenUsage } = await invokeResearchJson(
      llm,
      [
        new SystemMessage(REFLEXION_PROMPT),
        new HumanMessage(`Synthesis to verify:\n${state.synthesis}\n\nSources:\n${sourcesRef}`),
      ],
      {
        nodeName: ResearchNode.REFLEXION,
        state,
        config,
        maxOutputTokens: 1024,
        timeoutMs: SHORT_LLM_TIMEOUT_MS,
        schema: reflexionSchema,
        fallback: { passed: true },
        schemaDescription:
          '{"passed": boolean, "claims": [{"claim": string, "supportedBy": number[], "confidence": "high|medium|low|unsupported"}], "issues": string[], "suggestion": string}',
      }
    );

    if (audit.passed) {
      await emitProgress(ResearchStep.VERIFIED, "Synthesis passed fact-check", config);
      return { reflexionPassed: true, claims: audit.claims ?? [], tokenUsage };
    }

    await emitProgress(ResearchStep.CORRECTING, `${audit.issues?.length ?? 0} issues found - correcting...`, config);
    return {
      reflexionPassed: false,
      claims: (audit.claims ?? []) as ResearchClaim[],
      gaps: audit.issues ?? [],
      tokenUsage,
    };
  }, {
    nonCritical: true,
    fallback: async (_state, error, config) => {
      await emitProgress(
        ResearchStep.VERIFIED,
        `Verification skipped after failure: ${error instanceof Error ? error.message : "unknown error"}`,
        config
      );
      return { reflexionPassed: true, claims: [] };
    },
  });
}

export function correctNode(apiKey: string, model: string) {
  const llm = new ChatOpenAI({ modelName: model, apiKey, maxTokens: 4096, temperature: getSupportedTemperature(model, 0), streaming: false, timeout: LONG_LLM_TIMEOUT_MS });

  return withResearchNode(ResearchNode.CORRECT, async (state: ResearchStateType, config?: LangGraphRunnableConfig) => {
    const correctionAttempts = state.correctionAttempts + 1;
    const topSources = getRankedSources(state.sources, 12);
    const sourcesRef = topSources
      .map((s, i) => `[Source ${i + 1}] ${s.title} (${s.domain}): ${(s.fullContent ?? s.snippet).slice(0, 800)}`)
      .join("\n\n");

    const { text, tokenUsage } = await invokeResearchLLM(
      llm,
      [
        new SystemMessage(SYNTHESIZER_PROMPT),
        new HumanMessage(
          `Research query: ${state.query}\n\nPREVIOUS ISSUES TO FIX:\n- ${state.gaps.join("\n- ")}\n\nCORRECTION: Remove unsourced claims. Add [Source N] to every fact. State "could not be verified" for unconfirmable info.\n\nSources:\n${sourcesRef}`
        ),
      ],
      {
        nodeName: ResearchNode.CORRECT,
        state,
        config,
        maxOutputTokens: 4096,
        timeoutMs: LONG_LLM_TIMEOUT_MS,
      }
    );

    return {
      synthesis: text,
      reflexionPassed: false,
      correctionAttempts,
      tokenUsage,
    };
  }, {
    nonCritical: true,
    fallback: async (state, error, config) => {
      await emitProgress(
        ResearchStep.CORRECTING,
        `Correction skipped after failure: ${error instanceof Error ? error.message : "unknown error"}`,
        config
      );
      return {
        synthesis: state.synthesis,
        reflexionPassed: true,
        correctionAttempts: Limit.MAX_CORRECTION_ATTEMPTS,
        tokenUsage: emptyTokenUsage(),
      };
    },
  });
}
