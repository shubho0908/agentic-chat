import { ChatOpenAI } from "@langchain/openai";
import type { DynamicStructuredTool } from "@langchain/core/tools";
import { AIMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import type { AgentStateType } from "../state";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { MAX_RESPONSE_TOKENS, PlanComplexity } from "../constants";
import type { ReasoningEffortLevel } from "@/constants/openai-models";
import { getChatReasoningEffort, getSupportedTemperature } from "@/lib/modelPolicy";
import { getAnyMentionedComposioToolkits, selectToolsForAgentStep, hasWebActionIntent } from "../tools";
import { logger } from "@/lib/logger";
import { withRetry } from "@/lib/retry";
import { resolveJevHitlVerdict } from "../jevHitl";

export { buildChatSystemPrompt as buildSystemPrompt } from "@/lib/chat/systemPrompt";

import { buildChatSystemPrompt } from "@/lib/chat/systemPrompt";

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
  reasoningEffort?: ReasoningEffortLevel | null;
  temperature?: number;
}

export function createAgentNode(
  tools: DynamicStructuredTool[],
  apiKey: string,
  model: string,
  options: AgentNodeOptions = {}
) {
  const { reasoningEffort, temperature } = options;

  const resolvedEffort = getChatReasoningEffort(model, reasoningEffort);
  const supportedTemperature = getSupportedTemperature(model, temperature);

  const llm = new ChatOpenAI({
    modelName: model,
    apiKey,
    streaming: true,
    maxTokens: MAX_RESPONSE_TOKENS,
    ...(supportedTemperature !== undefined ? { temperature: supportedTemperature } : {}),
    ...(resolvedEffort
      ? { reasoning: { effort: resolvedEffort, summary: "detailed" as const } }
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

    const baseSystemPrompt = buildChatSystemPrompt({
      connectedServices,
      documentFocused: state.documentFocused,
    });
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

    // Jev HITL escalation (default off): shadow/ab only log a comparison
    // against the deterministic blocklist; active can add human review.
    // The verdict rides in graph state so the tools node replays the same
    // branch across an interrupt resume.
    const responseMessage = response as AIMessage;
    const toolCalls = responseMessage.tool_calls ?? [];
    const jevHitlEscalation = await resolveJevHitlVerdict(
      toolCalls,
      state.conversationId,
    ).catch((error) => {
      logger.warn("[Agent] Jev HITL escalation resolution failed:", error);
      return null;
    });
    return { messages: [response], jevHitlEscalation };
  };
}
