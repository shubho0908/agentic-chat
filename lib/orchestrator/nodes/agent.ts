import { ChatOpenAI } from "@langchain/openai";
import type { DynamicStructuredTool } from "@langchain/core/tools";
import { AIMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import type { AgentStateType } from "../state";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { MAX_RESPONSE_TOKENS, PlanComplexity } from "../constants";
import { getChatReasoningEffort, getSupportedTemperature } from "@/lib/modelPolicy";
import {
  TOOLKIT_DISPLAY_NAMES,
  type ComposioToolkit,
} from "@/lib/tools/composio/config";
import { getAnyMentionedComposioToolkits, selectToolsForAgentStep, hasWebActionIntent } from "../tools";
import { logger } from "@/lib/logger";
import { withRetry } from "@/lib/retry";
import {
  ARTIFACT_QUALITY_PROMPT,
  PROMPT_CONTEXT_BOUNDARY,
  PROMPT_MARKDOWN_PREAMBLE,
  PROMPT_OUTPUT_QUALITY,
  PROMPT_PRIVATE_ANALYSIS,
  PROMPT_RESPONSE_FORMATTING,
  PROMPT_SECURITY_BOUNDARY,
  joinPromptSections,
} from "@/lib/prompts";

const TOOL_AGENT_RULES = `Tool rules:
- Service tools are pre-authenticated as the user. Never ask for usernames, workspace URLs, account IDs, API keys, or credentials. The tools already know the user's connected account.
- Act proactively. Call tools immediately when user intent is clear. Use ask_user only for genuinely ambiguous choices.
- Destructive actions require confirmation first. Non-destructive actions should proceed when intent is clear.
- Read each tool name and description carefully. Pick the tool whose name exactly matches the requested action.
- If a tool requires an object identifier such as database_id, page_id, repository id/name, thread id, channel, or project id, discover it with a search/list/fetch tool before acting.
- Container queries such as databases, repos, channels, projects, or spreadsheets require discovery first: list/search containers, fetch schema or details when available, then query with exact field names and exact option values from the tool response.
- For mutations such as create, update, insert, append, delete, archive, or send, pick the matching write tool and call it with arguments derived from the user's request and fetched schema. Do not hand the user manual API commands when a connected tool can perform the action.
- "My" repos, emails, files, projects, pages, channels, or records means use the authenticated user's connected account without asking for a user identifier.
- If a service is listed as connected, its tools work immediately. No setup is needed from the user.
- Never fall back to web search, web scrape, or CSV/export requests when a connected service tool can answer the question. If the first connector call is insufficient, refine the args or try a better tool from the same connector.
- If a connector tool returns an auth or not-connected error, do not invent data. Tell the user which connector is not connected and to enable it in the Tools menu.`;

const RESEARCH_TOOL_RULES = `Research tool policy:
- Use deep_research only when the user explicitly requests a research investigation, deep dive, thorough investigation, or comprehensive multi-source analysis.
- Do not use deep_research for simple questions, basic comparisons, "tell me about X", "explain X", or questions answerable from model knowledge or a single web_search.
- Use web_search for factual lookups, quick comparisons, or current information needs.
- You can access public websites. To read one page, use web_scrape. To explore a site across pages or collect links, use web_crawl, then follow returned links with web_scrape or web_crawl as needed.
- If the user names a site without a URL, use web_search to find the URL before scraping or crawling it.`;

const EXECUTION_BUDGET_PROMPT = `Execution budget:
- Use at most about 15 tool-call rounds per user message.
- If a tool fails, try one materially different approach.
- Do not retry the same failing tool call with identical arguments.
- If two attempts cannot resolve the task, answer with what is known and explain what failed.
- For deep_research, call it once per topic; it handles its own multi-step searching internally.`;

const BASE_SYSTEM_PROMPT = joinPromptSections(
  PROMPT_MARKDOWN_PREAMBLE,
  `Role:
Helpful AI assistant with tool access. Be concise, direct, and action-oriented.`,
  PROMPT_OUTPUT_QUALITY,
  PROMPT_PRIVATE_ANALYSIS,
  TOOL_AGENT_RULES,
  RESEARCH_TOOL_RULES,
  PROMPT_CONTEXT_BOUNDARY,
  PROMPT_SECURITY_BOUNDARY,
  EXECUTION_BUDGET_PROMPT,
  PROMPT_RESPONSE_FORMATTING,
  ARTIFACT_QUALITY_PROMPT,
);

export function buildSystemPrompt(connectedServices: string[]): string {
  if (connectedServices.length === 0) return BASE_SYSTEM_PROMPT;

  const connectedNames = connectedServices
    .flatMap((s) => {
      const name = TOOLKIT_DISPLAY_NAMES[s as ComposioToolkit];
      return name ? [name] : [];
    })
    .join(", ");

  return `${BASE_SYSTEM_PROMPT}

Connected services (pre-authenticated): ${connectedNames}`;
}

function getMessageText(message: BaseMessage): string {
  return typeof message.content === "string"
    ? message.content
    : JSON.stringify(message.content) ?? "";
}

function isPlannerHint(message: BaseMessage): boolean {
  return message.type === "system" && getMessageText(message).startsWith("[PLAN]");
}

interface DanglingCall {
  id: string;
  name?: string;
}

function collectCallIds(message: BaseMessage): DanglingCall[] {
  const calls = new Map<string, DanglingCall>();
  const m = message as unknown as {
    tool_calls?: Array<{ id?: string; name?: string }>;
    invalid_tool_calls?: Array<{ id?: string; name?: string }>;
    response_metadata?: { output?: unknown };
    additional_kwargs?: { tool_calls?: unknown };
  };
  for (const tc of m.tool_calls ?? []) {
    if (tc.id) calls.set(tc.id, { id: tc.id, name: tc.name });
  }
  for (const tc of m.invalid_tool_calls ?? []) {
    if (tc.id && !calls.has(tc.id)) calls.set(tc.id, { id: tc.id, name: tc.name });
  }
  const rawOutput = m.response_metadata?.output;
  if (Array.isArray(rawOutput)) {
    for (const item of rawOutput) {
      if (item && typeof item === "object" && (item as { type?: string }).type === "function_call") {
        const callItem = item as { call_id?: unknown; name?: unknown };
        const id = typeof callItem.call_id === "string" ? callItem.call_id : undefined;
        if (id && !calls.has(id)) calls.set(id, { id, name: typeof callItem.name === "string" ? callItem.name : undefined });
      }
    }
  }
  const kwargsCalls = m.additional_kwargs?.tool_calls;
  if (Array.isArray(kwargsCalls)) {
    for (const tc of kwargsCalls) {
      if (tc && typeof tc === "object") {
        const id = typeof (tc as Record<string, unknown>).id === "string" ? (tc as Record<string, unknown>).id as string : undefined;
        const fn = (tc as Record<string, unknown>).function as Record<string, unknown> | undefined;
        const name = typeof fn?.name === "string" ? fn.name : undefined;
        if (id && !calls.has(id)) calls.set(id, { id, name });
      }
    }
  }
  return [...calls.values()];
}

function isAiMessage(msg: BaseMessage): boolean {
  if (msg instanceof AIMessage) return true;
  try {
    return msg.type === "ai";
  } catch {
    return false;
  }
}

function isToolMessage(msg: BaseMessage): msg is ToolMessage {
  if (msg instanceof ToolMessage) return true;
  try {
    return msg.type === "tool";
  } catch {
    return false;
  }
}

export function reconcileDanglingToolCalls(messages: BaseMessage[]): BaseMessage[] {
  const declaredCallIds = new Set<string>();
  for (const msg of messages) {
    if (isAiMessage(msg)) {
      for (const call of collectCallIds(msg)) {
        declaredCallIds.add(call.id);
      }
    }
  }

  const satisfied = new Set<string>();
  for (const msg of messages) {
    if (isToolMessage(msg) && typeof msg.tool_call_id === "string") {
      satisfied.add(msg.tool_call_id);
    }
  }

  const reconciled: BaseMessage[] = [];
  for (const msg of messages) {
    if (isToolMessage(msg)) {
      const callId = msg.tool_call_id;
      if (typeof callId === "string" && !declaredCallIds.has(callId)) {
        logger.log(`[Agent] Dropping orphaned ToolMessage with call_id: ${callId}`);
        continue;
      }
      reconciled.push(msg);
      continue;
    }

    if (!isAiMessage(msg)) {
      reconciled.push(msg);
      continue;
    }

    const calls = collectCallIds(msg);
    const danglingCalls = calls.filter((c) => !satisfied.has(c.id));

    if (danglingCalls.length === 0) {
      reconciled.push(msg);
      continue;
    }

    const aiMsg = msg as AIMessage;
    const danglingSet = new Set(danglingCalls.map((c) => c.id));
    const sanitized = new AIMessage({
      content: aiMsg.content,
      tool_calls: (aiMsg.tool_calls ?? []).filter((tc) => !tc.id || !danglingSet.has(tc.id)),
      invalid_tool_calls: (aiMsg.invalid_tool_calls ?? []).filter((tc) => !tc.id || !danglingSet.has(tc.id)),
      additional_kwargs: stripDanglingKwargs(aiMsg.additional_kwargs, danglingSet),
      response_metadata: stripDanglingOutput(aiMsg.response_metadata, satisfied),
      id: aiMsg.id,
      name: aiMsg.name,
      usage_metadata: aiMsg.usage_metadata,
    });
    reconciled.push(sanitized);

    for (const call of danglingCalls) {
      logger.log(`[Agent] Stripped dangling tool call: ${call.id} (${call.name ?? "unknown"})`);
    }
  }
  return reconciled;
}

function stripDanglingOutput(
  metadata: Record<string, unknown> | undefined,
  satisfied: Set<string>,
): Record<string, unknown> {
  if (!metadata || typeof metadata !== "object") return metadata ?? {};
  const output = metadata.output;
  if (!Array.isArray(output)) return metadata;

  const filtered = output.filter((item) => {
    if (!item || typeof item !== "object") return true;
    const typed = item as { type?: unknown; call_id?: unknown };
    if (typed.type !== "function_call") return true;
    const callId = typeof typed.call_id === "string" ? typed.call_id : undefined;
    return callId ? satisfied.has(callId) : true;
  });

  if (filtered.length === output.length) return metadata;
  if (filtered.length === 0) {
    const next = { ...metadata };
    delete next.output;
    return next;
  }
  return { ...metadata, output: filtered };
}

function stripDanglingKwargs(
  kwargs: Record<string, unknown> | undefined,
  danglingIds: Set<string>,
): Record<string, unknown> {
  if (!kwargs || typeof kwargs !== "object") return kwargs ?? {};
  const toolCalls = kwargs.tool_calls;
  if (!Array.isArray(toolCalls)) return kwargs;

  const filtered = toolCalls.filter((tc) => {
    if (!tc || typeof tc !== "object") return true;
    const id = (tc as Record<string, unknown>).id;
    return typeof id !== "string" || !danglingIds.has(id);
  });

  if (filtered.length === toolCalls.length) return kwargs;
  if (filtered.length === 0) {
    const next = { ...kwargs };
    delete next.tool_calls;
    return next;
  }
  return { ...kwargs, tool_calls: filtered };
}

function getLatestHumanText(messages: BaseMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.type === "human") {
      return getMessageText(message);
    }
  }
  return "";
}


interface AgentNodeOptions {
  thinkingEnabled?: boolean;
  temperature?: number;
}

export function createAgentNode(
  tools: DynamicStructuredTool[],
  apiKey: string,
  model: string,
  options: AgentNodeOptions = {}
) {
  const { thinkingEnabled = false, temperature } = options;

  const reasoningEffort = getChatReasoningEffort(model, thinkingEnabled);
  const supportedTemperature = getSupportedTemperature(model, temperature);

  const llm = new ChatOpenAI({
    modelName: model,
    apiKey,
    streaming: true,
    maxTokens: MAX_RESPONSE_TOKENS,
    ...(supportedTemperature !== undefined ? { temperature: supportedTemperature } : {}),
    ...(reasoningEffort
      ? { reasoning: { effort: reasoningEffort, summary: "detailed" as const } }
      : {}),
  });

  return async (state: AgentStateType, config?: LangGraphRunnableConfig) => {
    const incomingMessages: BaseMessage[] = [...state.messages];
    const plannerHints = incomingMessages
      .flatMap((msg) => isPlannerHint(msg) ? [getMessageText(msg)] : []);

    const conversationMessages = incomingMessages.filter((message, index) => {
      if (isPlannerHint(message)) return false;
      return !(index === 0 && message.type === "system");
    });

    const latestUserText = getLatestHumanText(conversationMessages);
    const connectedServices = state.connectedServices ?? [];

    const baseSystemPrompt = buildSystemPrompt(connectedServices);
    const isDirect =
      state.toolPlan?.complexity === PlanComplexity.DIRECT &&
      !hasWebActionIntent(latestUserText) &&
      getAnyMentionedComposioToolkits(latestUserText).length === 0;
    const selectedTools = isDirect
      ? []
      : selectToolsForAgentStep(tools, {
          latestUserText,
          plannedTools: state.toolPlan?.tools_needed,
          connectedServices,
        });
    logger.log(`[Agent] Selected ${selectedTools.length} tools for step: ${selectedTools.map(t => t.name).join(", ")}`);
    const availableToolsLine = selectedTools.length > 0
      ? `Available tools for this step: ${selectedTools.map((tool) => tool.name).join(", ")}`
      : "";
    const systemPrompt = plannerHints.length > 0
      ? `${baseSystemPrompt}${availableToolsLine ? `\n\n${availableToolsLine}` : ""}\n\nPlanner guidance:\n${plannerHints.join("\n")}`
      : `${baseSystemPrompt}${availableToolsLine ? `\n\n${availableToolsLine}` : ""}`;
    const runnable = selectedTools.length > 0 ? llm.bindTools(selectedTools) : llm;
    const messages = [new SystemMessage(systemPrompt), ...reconcileDanglingToolCalls(conversationMessages)];
    const response = await withRetry(
      (signal) => runnable.invoke(messages, { ...(config ?? {}), signal }),
      {
        retries: 2,
        initialDelayMs: 400,
        signal: config?.signal,
      }
    );
    return { messages: [response] };
  };
}
