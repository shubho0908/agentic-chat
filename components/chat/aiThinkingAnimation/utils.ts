import type { MemoryStatus } from "@/types/chat";
import { RoutingDecision } from "@/types/chat";
import { AI_THINKING_MESSAGES } from "./types";
import { CustomEventName, ToolStatus } from "@/lib/orchestrator/constants";

export function getContextualMessage(
  memoryStatus: MemoryStatus | undefined,
  hasContext: boolean,
): string {
  if (memoryStatus?.toolProgress?.toolName === CustomEventName.PLANNING &&
      memoryStatus.toolProgress.status === ToolStatus.RUNNING) {
    return "Preparing plan...";
  }

  if (!hasContext) {
    return AI_THINKING_MESSAGES.DEFAULT;
  }

  if (memoryStatus?.hasDocuments && memoryStatus.documentCount === 0 &&
      memoryStatus.documentContextState === "unavailable") {
    return "Waiting for attachment clarification...";
  }

  const routing = memoryStatus?.routingDecision;

  if (routing === RoutingDecision.VisionOnly) {
    return (memoryStatus?.imageCount ?? 0) > 1
      ? "Analyzing the provided context..."
      : "Analyzing the image to understand the context...";
  }

  if (routing === RoutingDecision.Hybrid) {
    return "Analyzing the provided context...";
  }

  if (routing === RoutingDecision.DocumentsOnly) {
    return (memoryStatus?.documentCount ?? 0) > 1
      ? "Analyzing the provided context..."
      : `Analyzing the ${memoryStatus?.attachmentContextKind === "snippet" ? "snippet" : "document"} to extract relevant information...`;
  }

  if (routing === RoutingDecision.MemoryOnly) {
    return AI_THINKING_MESSAGES.MEMORY_SYNTHESIS;
  }

  if (
    memoryStatus?.attemptedMemory &&
    !memoryStatus?.hasMemories &&
    routing !== RoutingDecision.ToolOnly
  ) {
    return "Checked conversation history for relevant memories...";
  }

  if (routing === RoutingDecision.ToolOnly) {
    const toolName = memoryStatus?.activeToolName?.replace("_", " ") || "tool";

    if (memoryStatus?.toolProgress?.message &&
        memoryStatus.toolProgress.toolName !== CustomEventName.PLANNING) {
      return memoryStatus.toolProgress.message;
    }

    return `Using ${toolName} to process your request...`;
  }

  const contexts = [];
  if (memoryStatus?.hasDocuments) contexts.push("documents");
  if (memoryStatus?.hasMemories) contexts.push("memories");
  if (memoryStatus?.attemptedMemory && !memoryStatus?.hasMemories)
    contexts.push("memory lookup");

  return contexts.length > 0
    ? `Synthesizing response with ${contexts.join(" and ")}...`
    : AI_THINKING_MESSAGES.GENERATING;
}
