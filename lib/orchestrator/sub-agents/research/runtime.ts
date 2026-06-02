import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { z } from "zod";
import { withRetry } from "@/lib/retry";
import {
  logError,
  logInfo,
  logMetric,
  logWarn,
  measureLatencyMs,
} from "@/lib/observability";
import { Limit, type ResearchNodeValue } from "./constants";
import type { ResearchStateType, ResearchTokenUsage } from "./state";

const LLM_RETRIES = 2;
const LLM_RETRY_INITIAL_DELAY_MS = 400;

export type InvokableLLM = {
  invoke(input: BaseMessage[], options?: LangGraphRunnableConfig): Promise<LLMResponse>;
};

export interface LLMResponse {
  content: unknown;
  usage_metadata?: unknown;
  response_metadata?: unknown;
}

interface InvokeResearchLLMOptions {
  nodeName: ResearchNodeValue;
  state: ResearchStateType;
  config?: LangGraphRunnableConfig;
  maxOutputTokens: number;
  timeoutMs: number;
}

interface InvokeJsonOptions<T> extends InvokeResearchLLMOptions {
  schema: z.ZodType<T>;
  fallback: T;
  schemaDescription: string;
}

export type ResearchNodeUpdate = Partial<ResearchStateType>;

export class ResearchTokenBudgetExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResearchTokenBudgetExceededError";
  }
}

export function createAbortError(message = "Research request aborted"): Error {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || /abort/i.test(error.message));
}

export function getAbortSignal(config?: LangGraphRunnableConfig): AbortSignal | undefined {
  return config?.signal;
}

export function throwIfAborted(config?: LangGraphRunnableConfig): void {
  const signal = getAbortSignal(config);
  if (signal?.aborted) {
    throw createAbortError();
  }
}

export function normalizeSearchQuery(query: string): string {
  return query
    .toLowerCase()
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function dedupeSearchQueries(
  queries: string[],
  previouslySearched: string[] = []
): string[] {
  const seen = new Set(previouslySearched.map(normalizeSearchQuery));
  const deduped: string[] = [];

  for (const query of queries) {
    const normalized = normalizeSearchQuery(query);
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    deduped.push(query.trim());
  }

  return deduped;
}

export function emptyTokenUsage(): ResearchTokenUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    llmCalls: 0,
  };
}

export function mergeTokenUsage(...usages: ResearchTokenUsage[]): ResearchTokenUsage {
  return usages.reduce<ResearchTokenUsage>(
    (total, usage) => ({
      inputTokens: total.inputTokens + usage.inputTokens,
      outputTokens: total.outputTokens + usage.outputTokens,
      totalTokens: total.totalTokens + usage.totalTokens,
      llmCalls: total.llmCalls + usage.llmCalls,
    }),
    emptyTokenUsage()
  );
}

function stringifyContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part) {
          const text = (part as { text?: unknown }).text;
          return typeof text === "string" ? text : "";
        }
        return "";
      })
      .join(" ");
  }

  return "";
}

function messageText(message: BaseMessage): string {
  return stringifyContent(message.content);
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function estimateMessageTokens(messages: BaseMessage[]): number {
  return messages.reduce((total, message) => total + estimateTokens(messageText(message)) + 4, 0);
}

function enforceTokenBudget(
  state: ResearchStateType,
  nodeName: ResearchNodeValue,
  messages: BaseMessage[],
  maxOutputTokens: number
): void {
  const budget = state.tokenBudget || Limit.MAX_TOKEN_BUDGET;
  const current = state.tokenUsage?.totalTokens ?? 0;
  const reserved = estimateMessageTokens(messages) + maxOutputTokens;

  if (current + reserved > budget) {
    throw new ResearchTokenBudgetExceededError(
      `Research token budget exceeded before ${nodeName}: estimated ${current + reserved}/${budget} tokens`
    );
  }
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function extractActualUsage(response: LLMResponse): ResearchTokenUsage | null {
  const usage = response.usage_metadata;
  if (usage && typeof usage === "object") {
    const record = usage as Record<string, unknown>;
    const inputTokens = readNumber(record.input_tokens);
    const outputTokens = readNumber(record.output_tokens);
    const totalTokens = readNumber(record.total_tokens);
    if (inputTokens !== undefined || outputTokens !== undefined || totalTokens !== undefined) {
      return {
        inputTokens: inputTokens ?? 0,
        outputTokens: outputTokens ?? 0,
        totalTokens: totalTokens ?? (inputTokens ?? 0) + (outputTokens ?? 0),
        llmCalls: 1,
      };
    }
  }

  const metadata = response.response_metadata;
  if (metadata && typeof metadata === "object") {
    const tokenUsage = (metadata as { tokenUsage?: unknown }).tokenUsage;
    if (tokenUsage && typeof tokenUsage === "object") {
      const record = tokenUsage as Record<string, unknown>;
      const inputTokens = readNumber(record.promptTokens);
      const outputTokens = readNumber(record.completionTokens);
      const totalTokens = readNumber(record.totalTokens);
      if (inputTokens !== undefined || outputTokens !== undefined || totalTokens !== undefined) {
        return {
          inputTokens: inputTokens ?? 0,
          outputTokens: outputTokens ?? 0,
          totalTokens: totalTokens ?? (inputTokens ?? 0) + (outputTokens ?? 0),
          llmCalls: 1,
        };
      }
    }
  }

  return null;
}

function fallbackUsage(messages: BaseMessage[], response: LLMResponse): ResearchTokenUsage {
  const inputTokens = estimateMessageTokens(messages);
  const outputTokens = estimateTokens(stringifyContent(response.content));
  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    llmCalls: 1,
  };
}

function withNodeConfig(
  config: LangGraphRunnableConfig | undefined,
  nodeName: ResearchNodeValue,
  signal?: AbortSignal
): LangGraphRunnableConfig {
  return {
    ...(config ?? {}),
    signal: signal ?? config?.signal,
    tags: [...(config?.tags ?? []), `research:${nodeName}`],
    metadata: {
      ...(config?.metadata ?? {}),
      researchNode: nodeName,
    },
  };
}

export async function invokeResearchLLM(
  llm: InvokableLLM,
  messages: BaseMessage[],
  options: InvokeResearchLLMOptions
): Promise<{ response: LLMResponse; text: string; tokenUsage: ResearchTokenUsage }> {
  throwIfAborted(options.config);
  enforceTokenBudget(options.state, options.nodeName, messages, options.maxOutputTokens);

  const response = await withRetry(
    (attemptSignal) =>
      llm.invoke(messages, withNodeConfig(options.config, options.nodeName, attemptSignal)),
    {
      retries: LLM_RETRIES,
      initialDelayMs: LLM_RETRY_INITIAL_DELAY_MS,
      timeoutMs: options.timeoutMs,
      signal: getAbortSignal(options.config),
    }
  );

  const tokenUsage = extractActualUsage(response) ?? fallbackUsage(messages, response);
  logMetric({
    metric: "research_llm_tokens",
    value: tokenUsage.totalTokens,
    unit: "count",
    node: options.nodeName,
    inputTokens: tokenUsage.inputTokens,
    outputTokens: tokenUsage.outputTokens,
  });

  return {
    response,
    text: stringifyContent(response.content),
    tokenUsage,
  };
}

function stripJsonFences(text: string): string {
  return text.replace(/```json?\n?|\n?```/g, "").trim();
}

function parseJsonCandidate(text: string): unknown {
  const cleaned = stripJsonFences(text);
  try {
    return JSON.parse(cleaned);
  } catch {
    const objectStart = cleaned.indexOf("{");
    const objectEnd = cleaned.lastIndexOf("}");
    if (objectStart >= 0 && objectEnd > objectStart) {
      return JSON.parse(cleaned.slice(objectStart, objectEnd + 1));
    }

    const arrayStart = cleaned.indexOf("[");
    const arrayEnd = cleaned.lastIndexOf("]");
    if (arrayStart >= 0 && arrayEnd > arrayStart) {
      return JSON.parse(cleaned.slice(arrayStart, arrayEnd + 1));
    }

    throw new Error("No JSON object or array found");
  }
}

export function parseJsonWithSchema<T>(
  text: string,
  schema: z.ZodType<T>
): { ok: true; value: T } | { ok: false; error: Error } {
  try {
    const parsed = parseJsonCandidate(text);
    const result = schema.safeParse(parsed);
    if (result.success) {
      return { ok: true, value: result.data };
    }
    return { ok: false, error: result.error };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error : new Error(String(error)) };
  }
}

export async function invokeResearchJson<T>(
  llm: InvokableLLM,
  messages: BaseMessage[],
  options: InvokeJsonOptions<T>
): Promise<{ value: T; tokenUsage: ResearchTokenUsage }> {
  const first = await invokeResearchLLM(llm, messages, options);
  const parsed = parseJsonWithSchema(first.text, options.schema);
  if (parsed.ok) {
    return { value: parsed.value, tokenUsage: first.tokenUsage };
  }

  logWarn({
    event: "research_json_parse_failed",
    node: options.nodeName,
    error: parsed.error.message,
    responsePreview: first.text.slice(0, 500),
  });

  const repairMessages = [
    new SystemMessage(
      "You repair invalid LLM JSON outputs. Return ONLY valid JSON matching the requested schema. No markdown, no prose."
    ),
    new HumanMessage(
      `Schema: ${options.schemaDescription}\n\nInvalid output:\n${first.text}\n\nParser error: ${parsed.error.message}`
    ),
  ];

  try {
    const repair = await invokeResearchLLM(llm, repairMessages, options);
    const repaired = parseJsonWithSchema(repair.text, options.schema);
    const tokenUsage = mergeTokenUsage(first.tokenUsage, repair.tokenUsage);
    if (repaired.ok) {
      return { value: repaired.value, tokenUsage };
    }

    logWarn({
      event: "research_json_repair_failed",
      node: options.nodeName,
      error: repaired.error.message,
      responsePreview: repair.text.slice(0, 500),
    });
    return { value: options.fallback, tokenUsage };
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
    logWarn({
      event: "research_json_repair_invoke_failed",
      node: options.nodeName,
      error: error instanceof Error ? error.message : String(error),
    });
    return { value: options.fallback, tokenUsage: first.tokenUsage };
  }
}

export function withResearchNode(
  nodeName: ResearchNodeValue,
  handler: (state: ResearchStateType, config?: LangGraphRunnableConfig) => Promise<ResearchNodeUpdate>,
  options: {
    nonCritical?: boolean;
    fallback?: (
      state: ResearchStateType,
      error: unknown,
      config?: LangGraphRunnableConfig
    ) => Promise<ResearchNodeUpdate> | ResearchNodeUpdate;
  } = {}
) {
  return async (
    state: ResearchStateType,
    config?: LangGraphRunnableConfig
  ): Promise<ResearchNodeUpdate> => {
    const startedAt = Date.now();
    throwIfAborted(config);
    const researchRunId = config?.metadata?.researchRunId as string | undefined;
    logInfo({
      event: "research_node_started",
      node: nodeName,
      researchRunId,
      searchRound: state.searchRound,
      sourceCount: state.sources.length,
    });

    try {
      const result = await handler(state, config);
      throwIfAborted(config);
      const latencyMs = measureLatencyMs(startedAt);
      logInfo({
        event: "research_node_finished",
        node: nodeName,
        researchRunId,
        latencyMs,
        sourceCount: state.sources.length,
      });
      logMetric({
        metric: "research_node_latency_ms",
        value: latencyMs,
        unit: "ms",
        node: nodeName,
        researchRunId,
      });
      return result;
    } catch (error) {
      if (isAbortError(error)) {
        logWarn({
          event: "research_node_aborted",
          node: nodeName,
          researchRunId,
          latencyMs: measureLatencyMs(startedAt),
        });
        throw error;
      }

      const payload = {
        event: "research_node_failed",
        node: nodeName,
        researchRunId,
        latencyMs: measureLatencyMs(startedAt),
        error: error instanceof Error ? error.message : String(error),
      };

      if (options.nonCritical) {
        logWarn(payload);
        return options.fallback ? await options.fallback(state, error, config) : {};
      }

      logError(payload);
      throw error;
    }
  };
}
