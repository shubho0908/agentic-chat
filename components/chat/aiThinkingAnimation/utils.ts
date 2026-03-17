import { Brain, Eye, Zap, Focus, LucideIcon, Atom, Globe } from "lucide-react";
import type { MemoryStatus } from "@/types/chat";
import { RoutingDecision } from "@/types/chat";
import { TOOL_IDS } from "@/lib/tools/config";
import { AI_THINKING_MESSAGES } from "./types";

export function isToolActive(
  memoryStatus: MemoryStatus | undefined,
  toolId: typeof TOOL_IDS[keyof typeof TOOL_IDS]
): boolean {
  return (
    memoryStatus?.routingDecision === RoutingDecision.ToolOnly &&
    memoryStatus?.activeToolName === toolId
  );
}

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

  if (routing === RoutingDecision.UrlContent) {
    const urlCount = memoryStatus?.urlCount ?? 0;
    const urlText = urlCount !== 1 ? "URLs" : "URL";
    return `Processing content from ${urlCount} ${urlText}...`;
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

type RoutingIconConfig = {
  icon: LucideIcon;
  className: string;
};

export function getRoutingIconConfig(routingDecision?: RoutingDecision): RoutingIconConfig {
  switch (routingDecision) {
    case RoutingDecision.VisionOnly:
      return { icon: Eye, className: "w-3.5 h-3.5 text-cyan-500" };
    case RoutingDecision.Hybrid:
      return { icon: Zap, className: "w-3.5 h-3.5 text-purple-500" };
    case RoutingDecision.DocumentsOnly:
      return { icon: Focus, className: "w-3.5 h-3.5 text-amber-500" };
    case RoutingDecision.MemoryOnly:
      return { icon: Brain, className: "w-3.5 h-3.5 text-indigo-500" };
    case RoutingDecision.ToolOnly:
      return { icon: Atom, className: "w-3.5 h-3.5 text-blue-500" };
    case RoutingDecision.UrlContent:
      return { icon: Globe, className: "w-3.5 h-3.5 text-blue-500" };
    default:
      return { icon: Zap, className: "w-3.5 h-3.5 text-gray-500" };
  }
}

export function getRoutingLabel(routingDecision?: RoutingDecision): string {
  switch (routingDecision) {
    case RoutingDecision.VisionOnly:
      return "Vision Focus";
    case RoutingDecision.Hybrid:
      return "Hybrid Mode";
    case RoutingDecision.DocumentsOnly:
      return "Document Focus";
    case RoutingDecision.MemoryOnly:
      return "Memory Context";
    case RoutingDecision.ToolOnly:
      return "Tool Active";
    case RoutingDecision.UrlContent:
      return "Web Content";
    default:
      return "Standard";
  }
}
