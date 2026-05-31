import { ToolNode } from "@langchain/langgraph/prebuilt";
import { interrupt } from "@langchain/langgraph";
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

type ToolCall = NonNullable<AIMessage["tool_calls"]>[number];

function getToolCallId(toolCall: ToolCall, index: number): string {
  return typeof toolCall.id === "string" && toolCall.id.trim()
    ? toolCall.id
    : `${toolCall.name || "tool"}-${index}`;
}

function isAuthFailureText(content: string): boolean {
  return /(?:not connected|no connected account|connection not found|no account connected|invalid auth|authentication failed|unauthori[sz]ed|\b401\b)/i.test(content);
}

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
        tool_call_id: getToolCallId(toolCall, index),
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

  return async (state: AgentStateType) => {
    const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
    const toolCalls = lastMessage.tool_calls ?? [];

    if (toolCalls.length === 0) {
      return { messages: [] };
    }

    const askUserCalls = toolCalls.filter((tc) => tc.name === ASK_USER_TOOL_NAME);
    if (askUserCalls.length > 0) {
      const primaryCall = askUserCalls[0];
      const primaryCallIndex = toolCalls.indexOf(primaryCall);
      const primaryCallId = getToolCallId(primaryCall, primaryCallIndex);
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
              tool_call_id: getToolCallId(tc, index),
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
          id: getToolCallId(tc, toolCalls.indexOf(tc)),
          name: tc.name,
          args: tc.args,
        })),
      });

      if (approval !== HUMAN_IN_THE_LOOP_APPROVED) {
        return {
          messages: toolCalls.map(
            (tc, index) =>
              new ToolMessage({
                tool_call_id: getToolCallId(tc, index),
                content: dangerousCalls.some((dangerousCall) => dangerousCall === tc)
                  ? `Action ${approval === HUMAN_IN_THE_LOOP_DENIED ? "denied" : "rejected"} by user.`
                  : "Skipped because another requested action was not approved.",
              })
          ),
        };
      }
    }

    try {
      const result = await toolNode.invoke({ ...state, messages: [...state.messages] }) as { messages: ToolMessage[] };
      const sanitized = result.messages.map(sanitizeToolMessage);

      const observedCallIds = new Set(
        sanitized.map((m) => m.tool_call_id).filter((id): id is string => typeof id === "string")
      );
      const missing: ToolMessage[] = [];
      toolCalls.forEach((tc, index) => {
        const callId = getToolCallId(tc, index);
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

      return { messages: [...sanitized, ...missing] };
    } catch (error) {
      logger.error("[ToolNode] Tool execution failed:", error);
      return { messages: createToolErrorMessages(toolCalls, error) };
    }
  };
}
