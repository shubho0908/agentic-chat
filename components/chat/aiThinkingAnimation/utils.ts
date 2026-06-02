import type { MemoryStatus } from "@/types/chat";
import { RoutingDecision } from "@/types/chat";
import { AI_THINKING_MESSAGES } from "./types";

export function getContextualMessage(
  memoryStatus: MemoryStatus | undefined,
  hasContext: boolean
): string {
  if (!hasContext) {
    return AI_THINKING_MESSAGES.DEFAULT;
  }

  const routing = memoryStatus?.routingDecision;

  if (routing === RoutingDecision.VisionOnly) {
    const isMultiple = (memoryStatus?.imageCount ?? 0) > 1;
    return isMultiple
      ? AI_THINKING_MESSAGES.VISION_MULTIPLE
      : AI_THINKING_MESSAGES.VISION_SINGLE;
  }

  if (routing === RoutingDecision.Hybrid) {
    const imageText = (memoryStatus?.imageCount ?? 0) > 1 ? "images" : "image";
    const docCount = memoryStatus?.documentCount ?? 0;
    const docText = docCount !== 1 ? "docs" : "doc";
    return `Analyzing ${imageText} and ${docCount} ${docText} together...`;
  }

  if (routing === RoutingDecision.DocumentsOnly) {
    const docCount = memoryStatus?.documentCount ?? 0;
    const docText = docCount !== 1 ? "docs" : "doc";
    return `Analyzing ${docCount} attached ${docText} with focused context...`;
  }

  if (routing === RoutingDecision.MemoryOnly) {
    return AI_THINKING_MESSAGES.MEMORY_SYNTHESIS;
  }

  if (memoryStatus?.attemptedMemory && !memoryStatus?.hasMemories && routing !== RoutingDecision.ToolOnly) {
    return "Checked conversation history for relevant memories...";
  }

  if (routing === RoutingDecision.ToolOnly) {
    const toolName = memoryStatus?.activeToolName?.replace("_", " ") || "tool";

    if (memoryStatus?.toolProgress?.message) {
      return memoryStatus.toolProgress.message;
    }
    
    return `Using ${toolName} to process your request...`;
  }

  const contexts = [];
  if (memoryStatus?.hasDocuments) contexts.push("documents");
  if (memoryStatus?.hasMemories) contexts.push("memories");
  if (memoryStatus?.attemptedMemory && !memoryStatus?.hasMemories) contexts.push("memory lookup");

  return contexts.length > 0
    ? `Synthesizing response with ${contexts.join(" and ")}...`
    : AI_THINKING_MESSAGES.GENERATING;
}
