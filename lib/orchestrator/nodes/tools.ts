import { ToolNode } from "@langchain/langgraph/prebuilt";
import { interrupt } from "@langchain/langgraph";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import type { DynamicStructuredTool } from "@langchain/core/tools";
import type { AIMessage } from "@langchain/core/messages";
import { ToolMessage } from "@langchain/core/messages";
import {
  notConnectedMessage,
  getComposioToolkitForToolName,
  isDangerousAction,
} from "@/lib/tools/composio/config";
import { HUMAN_IN_THE_LOOP_APPROVED, HUMAN_IN_THE_LOOP_DENIED, HUMAN_IN_THE_LOOP_REQUEST_TYPE, TOOL_ERROR_STATUS } from "../constants";
import type { AgentStateType } from "../state";
import { ASK_USER_TOOL_NAME } from "../tools";
import { HumanInTheLoopRequestKind } from "@/lib/tools/constants";
import { sanitizeToolOutput } from "@/lib/sanitize";
import { logger } from "@/lib/logger";
import { createRequestId } from "@/lib/observability";
import {
  ToolFailureKind,
  classifyToolFailure,
  failureRoundsSinceLastHuman,
  formatFailureMessage,
  isAuthFailureText,
  toolCallResultId,
  toolCallSignature,
  trailingIdenticalFailureCount,
} from "../toolFailure";
import { JevCheckpoint, JevFallbackReason, JevMode } from "@/lib/jev/types";
import { JevDecisionClient } from "@/lib/jev/client";
import { getJevMode } from "@/lib/jev/config";
import { logJevDecision } from "@/lib/jev/telemetry";
import {
  evaluateToolDiagnosisWithJev,
  mapJevDiagnosisResult,
} from "@/lib/jev/toolRouter";

type ToolCall = NonNullable<AIMessage["tool_calls"]>[number];

const jevClient = JevDecisionClient.createIfConfigured();

function getConnectorFailureText(content: string): string | null {
  if (content.trimStart().startsWith("{")) {
    try {
      const parsed = JSON.parse(content) as { successful?: unknown; error?: unknown };
      if (parsed && typeof parsed === "object" && "successful" in parsed) {
        if (parsed.successful !== false) return null;
        return typeof parsed.error === "string" ? parsed.error : null;
      }
    } catch {
      // Not the Composio envelope — fall back to scanning the raw string.
    }
  }
  return content;
}

function normalizeConnectorToolContent(toolName: string | undefined, content: string): string {
  const toolkit = toolName ? getComposioToolkitForToolName(toolName) : null;
  if (!toolkit) return content;
  logger.log("[ToolNode] Composio tool response received", {
    toolName,
    contentLength: content.length,
    looksLikeJson: content.trimStart().startsWith("{"),
  });

  const failureText = getConnectorFailureText(content);
  if (failureText !== null && isAuthFailureText(failureText)) {
    logger.warn("[ToolNode] Composio tool auth failure detected", { toolName });
    return notConnectedMessage(toolkit);
  }

  return content;
}

function createToolErrorMessages(toolCalls: ToolCall[], error: unknown): ToolMessage[] {
  const errorMessage = error instanceof Error ? error.message : String(error);

  return toolCalls.map(
    (toolCall, index) => {
      const content = sanitizeToolOutput(
        normalizeConnectorToolContent(toolCall.name, `Tool execution failed: ${errorMessage}`)
      );

      return new ToolMessage({
        tool_call_id: toolCallResultId(toolCall, index),
        name: toolCall.name,
        content,
        status: TOOL_ERROR_STATUS,
        additional_kwargs: {
          status: TOOL_ERROR_STATUS,
          error: errorMessage,
        },
      });
    }
  );
}

function previewArgs(args: unknown): string {
  try {
    return (JSON.stringify(args) ?? "null").slice(0, 200);
  } catch {
    return typeof args;
  }
}

/** Best-effort Jev note on the first failure of the round. Runs only in
 * shadow mode and only for retryable kinds, bounded by the diagnosis
 * timeout. Terminal kinds and every failure path keep the deterministic
 * envelope untouched. */
async function appendJevDiagnosis(
  toolCalls: ToolCall[],
  messages: ToolMessage[],
  history: AgentStateType["messages"],
  conversationId: string | undefined,
): Promise<void> {
  if (!jevClient) return;
  if (getJevMode(JevCheckpoint.TOOL_ROUTER) !== JevMode.SHADOW) return;

  const byId = new Map(messages.map((m) => [m.tool_call_id, m]));
  const first = toolCalls
    .map((tc, index) => ({ tc, index, id: toolCallResultId(tc, index) }))
    .find(({ id }) => {
      const msg = byId.get(id);
      return (
        !!msg &&
        typeof msg.content === "string" &&
        classifyToolFailure(msg.content, msg.status) !== null
      );
    });
  if (!first) return;

  const target = byId.get(first.id);
  if (!target || typeof target.content !== "string") return;
  const kind =
    classifyToolFailure(target.content, target.status) ??
    ToolFailureKind.UNKNOWN;
  if (kind !== ToolFailureKind.TRANSIENT && kind !== ToolFailureKind.UNKNOWN) {
    return;
  }

  const requestId = createRequestId("jev_tool_diagnosis");
  const startedAt = Date.now();
  try {
    const result = await evaluateToolDiagnosisWithJev(
      jevClient,
      {
        toolName:
          typeof first.tc.name === "string" && first.tc.name
            ? first.tc.name
            : "tool",
        argsPreview: previewArgs(first.tc.args),
        failureKind: kind,
        identicalFailureCount: trailingIdenticalFailureCount(
          failureRoundsSinceLastHuman(history),
          toolCallSignature(first.tc.name, first.tc.args),
        ),
      },
      { requestId, conversationId },
    );
    const advice = mapJevDiagnosisResult(result);
    if (!advice) {
      logJevDecision({
        checkpoint: JevCheckpoint.TOOL_ROUTER,
        schemaVersion: "1.0.0",
        modelVersion: result.modelVersion,
        mode: JevMode.SHADOW,
        latencyMs: Date.now() - startedAt,
        outcome: "invalid_response",
        fallbackUsed: true,
        fallbackReason: JevFallbackReason.INVALID,
        requestId,
        conversationId,
      });
      return;
    }
    target.content =
      `${target.content} [jev: retry ${advice.retryWorthwhile < 0.5 ? "unlikely" : "likely"} ` +
      `(${advice.retryWorthwhile.toFixed(2)}), suggested: ${advice.fixDirection}]`;
    logJevDecision({
      checkpoint: JevCheckpoint.TOOL_ROUTER,
      schemaVersion: "1.0.0",
      modelVersion: result.modelVersion,
      mode: JevMode.SHADOW,
      latencyMs: result.latencyMs,
      outcome: `diagnosed_${advice.fixDirection}`,
      fallbackUsed: false,
      inputTokens: result.usage?.input_tokens,
      outputTokens: result.usage?.output_tokens,
      requestId,
      conversationId,
    });
  } catch (error) {
    logJevDecision({
      checkpoint: JevCheckpoint.TOOL_ROUTER,
      schemaVersion: "1.0.0",
      modelVersion: "unknown",
      mode: JevMode.SHADOW,
      latencyMs: Date.now() - startedAt,
      outcome: "error",
      fallbackUsed: true,
      fallbackReason:
        error instanceof Error && error.name === "AbortError"
          ? JevFallbackReason.TIMEOUT
          : JevFallbackReason.ERROR,
      requestId,
      conversationId,
    });
  }
}
/** Single choke point: every failure result leaving this node carries a
 * structured header plus hint, however it was produced. Already-marked
 * messages pass through untouched so envelopes never nest. */
function wrapFailureEnvelope(message: ToolMessage): ToolMessage {
  if (typeof message.content !== "string") return message;
  if (message.content.startsWith("[tool-failure:")) return message;
  const kind = classifyToolFailure(message.content, message.status);
  if (kind === null) return message;
  return new ToolMessage({
    id: message.id,
    name: message.name,
    content: formatFailureMessage(kind, message.content),
    tool_call_id: message.tool_call_id,
    additional_kwargs: message.additional_kwargs,
    response_metadata: message.response_metadata,
    status: message.status,
    artifact: message.artifact,
    metadata: message.metadata,
  });
}
function sanitizeToolMessage(message: ToolMessage): ToolMessage {
  if (typeof message.content !== "string") {
    return message;
  }

  const content = normalizeConnectorToolContent(message.name, message.content);

  return new ToolMessage({
    id: message.id,
    name: message.name,
    content: sanitizeToolOutput(content),
    tool_call_id: message.tool_call_id,
    additional_kwargs: message.additional_kwargs,
    response_metadata: message.response_metadata,
    status: message.status,
    artifact: message.artifact,
    metadata: message.metadata,
  });
}

export function createToolNode(tools: DynamicStructuredTool[]) {
  const toolNode = new ToolNode(tools);

  return async (state: AgentStateType, config?: LangGraphRunnableConfig) => {
    const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
    const toolCalls = lastMessage.tool_calls ?? [];

    if (toolCalls.length === 0) {
      return { messages: [] };
    }

    const askUserCalls = toolCalls.filter((tc) => tc.name === ASK_USER_TOOL_NAME);
    if (askUserCalls.length > 0) {
      const primaryCall = askUserCalls[0];
      const primaryCallIndex = toolCalls.indexOf(primaryCall);
      const primaryCallId = toolCallResultId(primaryCall, primaryCallIndex);
      const args = primaryCall.args ?? {};
      const response: unknown = interrupt({
        type: HUMAN_IN_THE_LOOP_REQUEST_TYPE,
        requestKind: HumanInTheLoopRequestKind.ASK_USER,
        toolCallId: primaryCallId,
        question: typeof args.question === "string" ? args.question : "Can you clarify how to proceed?",
        reason: typeof args.reason === "string" ? args.reason : undefined,
        title: typeof args.title === "string" ? args.title : undefined,
        context: typeof args.context === "string" ? args.context : undefined,
        options: Array.isArray(args.options) ? args.options : undefined,
        recommendation: typeof args.recommendation === "string" ? args.recommendation : undefined,
      });

      const answer = typeof response === "string" && response.trim()
        ? response.trim()
        : "No user answer was provided.";

      return {
        messages: toolCalls.map(
          (tc, index) =>
            new ToolMessage({
              tool_call_id: toolCallResultId(tc, index),
              content:
                tc === primaryCall
                  ? answer
                  : "Skipped while waiting for user clarification.",
            })
        ),
      };
    }

    const dangerousCalls = toolCalls.filter((tc) => isDangerousAction(tc.name));

    if (dangerousCalls.length > 0) {
      const approval: unknown = interrupt({
        type: HUMAN_IN_THE_LOOP_REQUEST_TYPE,
        requestKind: HumanInTheLoopRequestKind.APPROVAL,
        toolCalls: dangerousCalls.map((tc) => ({
          id: toolCallResultId(tc, toolCalls.indexOf(tc)),
          name: tc.name,
          args: tc.args,
        })),
      });

      if (approval !== HUMAN_IN_THE_LOOP_APPROVED) {
        return {
          messages: toolCalls.map(
            (tc, index) =>
              new ToolMessage({
                tool_call_id: toolCallResultId(tc, index),
                content: dangerousCalls.some((dangerousCall) => dangerousCall === tc)
                  ? `Action ${approval === HUMAN_IN_THE_LOOP_DENIED ? "denied" : "rejected"} by user.`
                  : "Skipped because another requested action was not approved.",
              })
          ),
        };
      }
    }

    try {
      const result = await toolNode.invoke(
        { ...state, messages: [...state.messages] },
        config
      ) as { messages: ToolMessage[] };
      const sanitized = result.messages.map(sanitizeToolMessage);

      const observedCallIds = new Set(
        sanitized.map((m) => m.tool_call_id).filter((id): id is string => typeof id === "string")
      );
      const missing: ToolMessage[] = [];
      toolCalls.forEach((tc, index) => {
        const callId = toolCallResultId(tc, index);
        if (observedCallIds.has(callId)) return;
        logger.warn("[ToolNode] Missing tool output — synthesizing error message", {
          callId,
          toolName: tc.name,
        });
        missing.push(
          new ToolMessage({
            tool_call_id: callId,
            name: tc.name,
            content: sanitizeToolOutput("Tool execution did not return a result."),
            status: TOOL_ERROR_STATUS,
            additional_kwargs: { status: TOOL_ERROR_STATUS },
          })
        );
      });

      const enveloped = [...sanitized, ...missing].map(wrapFailureEnvelope);
      await appendJevDiagnosis(
        toolCalls,
        enveloped,
        state.messages,
        state.conversationId,
      );

      return { messages: enveloped };
    } catch (error) {
      logger.error("[ToolNode] Tool execution failed:", error);
      return {
        messages: createToolErrorMessages(toolCalls, error).map(
          wrapFailureEnvelope,
        ),
      };
    }
  };
}
