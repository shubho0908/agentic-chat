import type { BaseMessage } from "@langchain/core/messages";
import type { AIMessage } from "@langchain/core/messages";
import { createRequestId, logWarn } from "@/lib/observability";
import { JevDecisionClient } from "@/lib/jev/client";
import { JevCheckpoint, type JevQuestions } from "@/lib/jev/types";
import { getComposioToolkitForToolName, isDangerousAction } from "@/lib/tools/composio/config";
import { ToolName } from "@/lib/tools/constants";
import { UntrustedOrigin } from "./untrustedContent";

type ToolCall = NonNullable<AIMessage["tool_calls"]>[number];
const QUESTIONS: JevQuestions = { private_data_leak: { type: "noul", instructions: "Given that this turn contains private connected-account data, would these tool arguments disclose, copy, encode, or use that private data in an external query, URL, recipient message, shared artifact, or mutation? Ordinary identifiers supplied by the user are not private-source leakage." } };

export function toolOutputOrigin(toolName: string | undefined) {
  return toolName && getComposioToolkitForToolName(toolName) ? UntrustedOrigin.TOOL_PRIVATE : UntrustedOrigin.TOOL_PUBLIC;
}

export function hasPrivateSource(messages: BaseMessage[]): boolean {
  return messages.some((message) => ((message as unknown as { metadata?: Record<string, unknown> }).metadata)?.security_origin === UntrustedOrigin.TOOL_PRIVATE);
}

export function isExternalSink(toolName: string): boolean {
  return toolName === ToolName.WEB_SEARCH || toolName === ToolName.WEB_SCRAPE || toolName === ToolName.WEB_CRAWL || toolName === ToolName.DEEP_RESEARCH || isDangerousAction(toolName);
}

export async function blocksPrivateDataLeak(toolCalls: ToolCall[], messages: BaseMessage[], conversationId?: string, dependency?: JevDecisionClient | null): Promise<boolean> {
  if (!hasPrivateSource(messages)) return false;
  const sinks = toolCalls.filter((call) => isExternalSink(call.name));
  if (!sinks.length) return false;
  const client = dependency === undefined ? JevDecisionClient.createIfConfigured() : dependency;
  if (!client) return true;
  try {
    const result = await client.evaluate({ checkpoint: JevCheckpoint.OUTPUT_DLP, schemaVersion: "2.0.0", state: { sinks: sinks.map(({ name, args }) => ({ name, args })) }, questions: QUESTIONS, timeoutMs: 2_000, traceContext: { requestId: createRequestId("private_sink"), conversationId } });
    const answer = result.answers.private_data_leak;
    if (answer?.type !== "noul") return true;
    return answer.noul >= 0.5;
  } catch (error) {
    logWarn({ event: "private_sink_gate_failed_closed", error: error instanceof Error ? error.message : String(error) });
    return true;
  }
}
