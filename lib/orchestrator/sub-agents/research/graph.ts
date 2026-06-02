import { StateGraph } from "@langchain/langgraph";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { createHash } from "node:crypto";
import { ResearchState, type ResearchStateType, type ResearchSource } from "./state";
import { ResearchNode, type ResearchNodeValue, Limit, CLARIFICATION_PREFIX } from "./constants";
import { getRankedSources } from "./scoring";
import { getCheckpointer } from "../../checkpointer";
import {
  triageNode,
  decomposeNode,
  planQueriesNode,
  searchNode,
  deepScrapeNode,
  evaluateNode,
  synthesizeNode,
  reflexionNode,
  correctNode,
} from "./nodes";
import { logger } from "@/lib/logger";
import { throwIfAborted } from "./runtime";

function routeAfterTriage(state: ResearchStateType): ResearchNodeValue | "__end__" {
  return state.clarificationQuestions.length > 0 ? "__end__" : ResearchNode.DECOMPOSE;
}

function routeAfterEvaluate(state: ResearchStateType): ResearchNodeValue {
  if (state.searchQueries.length > 0 && state.searchRound < Limit.MAX_SEARCH_ROUNDS) {
    return ResearchNode.SEARCH;
  }
  return ResearchNode.DEEP_SCRAPE;
}

function routeAfterReflexion(state: ResearchStateType): ResearchNodeValue | "__end__" {
  if (state.reflexionPassed) {
    return "__end__";
  }

  return state.correctionAttempts < Limit.MAX_CORRECTION_ATTEMPTS
    ? ResearchNode.CORRECT
    : "__end__";
}

function routeAfterCorrect(state: ResearchStateType): ResearchNodeValue | "__end__" {
  return state.reflexionPassed ? "__end__" : ResearchNode.REFLEXION;
}

async function createResearchGraph(
  apiKey: string,
  model: string,
  options: { checkpoint: boolean }
) {
  const builder = new StateGraph(ResearchState)
    .addNode(ResearchNode.TRIAGE, triageNode(apiKey, model))
    .addNode(ResearchNode.DECOMPOSE, decomposeNode(apiKey, model))
    .addNode(ResearchNode.PLAN_QUERIES, planQueriesNode(apiKey, model))
    .addNode(ResearchNode.SEARCH, searchNode())
    .addNode(ResearchNode.EVALUATE, evaluateNode(apiKey, model))
    .addNode(ResearchNode.DEEP_SCRAPE, deepScrapeNode())
    .addNode(ResearchNode.SYNTHESIZE, synthesizeNode(apiKey, model))
    .addNode(ResearchNode.REFLEXION, reflexionNode(apiKey, model))
    .addNode(ResearchNode.CORRECT, correctNode(apiKey, model))
    .addEdge("__start__", ResearchNode.TRIAGE)
    .addConditionalEdges(ResearchNode.TRIAGE, routeAfterTriage, {
      [ResearchNode.DECOMPOSE]: ResearchNode.DECOMPOSE,
      __end__: "__end__",
    })
    .addEdge(ResearchNode.DECOMPOSE, ResearchNode.PLAN_QUERIES)
    .addEdge(ResearchNode.PLAN_QUERIES, ResearchNode.SEARCH)
    .addEdge(ResearchNode.SEARCH, ResearchNode.EVALUATE)
    .addConditionalEdges(ResearchNode.EVALUATE, routeAfterEvaluate, {
      [ResearchNode.SEARCH]: ResearchNode.SEARCH,
      [ResearchNode.DEEP_SCRAPE]: ResearchNode.DEEP_SCRAPE,
    })
    .addEdge(ResearchNode.DEEP_SCRAPE, ResearchNode.SYNTHESIZE)
    .addEdge(ResearchNode.SYNTHESIZE, ResearchNode.REFLEXION)
    .addConditionalEdges(ResearchNode.REFLEXION, routeAfterReflexion, {
      [ResearchNode.CORRECT]: ResearchNode.CORRECT,
      __end__: "__end__",
    })
    .addConditionalEdges(ResearchNode.CORRECT, routeAfterCorrect, {
      [ResearchNode.REFLEXION]: ResearchNode.REFLEXION,
      __end__: "__end__",
    });

  if (!options.checkpoint) {
    return builder.compile();
  }

  try {
    const checkpointer = await getCheckpointer();
    return builder.compile({ checkpointer });
  } catch (error) {
    logger.warn("[ResearchAgent] Checkpointing unavailable; running without research checkpoints:", error);
    return builder.compile();
  }
}

function buildClarificationResponse(questions: string[]): string {
  return `${CLARIFICATION_PREFIX}\nBefore I can research this effectively, I need to understand:\n${questions.map((q, i) => `${i + 1}. ${q}`).join("\n")}\n\nPlease ask the user these questions, then call deep_research again with their answers in the userContext field.`;
}

function hasThreadId(config?: LangGraphRunnableConfig): boolean {
  return typeof config?.configurable?.thread_id === "string" && config.configurable.thread_id.length > 0;
}

function getResearchCheckpointNamespace(query: string): string {
  const key = createHash("sha256").update(query).digest("hex").slice(0, 16);
  return `deep_research:${key}`;
}

function buildResearchConfig(
  query: string,
  config?: LangGraphRunnableConfig,
  signal?: AbortSignal
): LangGraphRunnableConfig {
  const checkpointNamespace = getResearchCheckpointNamespace(query);
  const parentNamespace = config?.configurable?.checkpoint_ns;

  return {
    ...(config ?? {}),
    signal: signal ?? config?.signal,
    tags: [...(config?.tags ?? []), "deep_research"],
    metadata: {
      ...(config?.metadata ?? {}),
      researchQueryHash: checkpointNamespace,
    },
    configurable: {
      ...(config?.configurable ?? {}),
      checkpoint_ns: parentNamespace
        ? `${parentNamespace}|${checkpointNamespace}`
        : checkpointNamespace,
    },
  };
}

export async function invokeResearchAgent(
  query: string,
  apiKey: string,
  model: string,
  config?: LangGraphRunnableConfig,
  options?: { userContext?: string; signal?: AbortSignal; tokenBudget?: number }
): Promise<string> {
  const researchConfig = buildResearchConfig(query, config, options?.signal);
  throwIfAborted(researchConfig);
  const graph = await createResearchGraph(apiKey, model, { checkpoint: hasThreadId(researchConfig) });

  const result = await graph.invoke(
    {
      query,
      userContext: options?.userContext ?? "",
      maxRounds: Limit.MAX_SEARCH_ROUNDS,
      tokenBudget: options?.tokenBudget ?? Limit.MAX_TOKEN_BUDGET,
    },
    { ...researchConfig, recursionLimit: Limit.RECURSION_LIMIT }
  );

  if (result.clarificationQuestions.length > 0) {
    return buildClarificationResponse(result.clarificationQuestions);
  }

  if (result.synthesis) return result.synthesis;

  logger.warn("[ResearchAgent] No synthesis produced, returning raw sources");
  return getRankedSources(result.sources, 8)
    .map((s: ResearchSource) => `- ${s.title} (${s.domain}): ${s.snippet.slice(0, 200)}`)
    .join("\n");
}
