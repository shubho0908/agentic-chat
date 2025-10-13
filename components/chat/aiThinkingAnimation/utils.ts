import { Brain, Eye, Zap, Focus, Wand, LucideIcon } from "lucide-react";
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

  if (routing === RoutingDecision.MemoryOnly) {
    return AI_THINKING_MESSAGES.MEMORY_SYNTHESIS;
  }

  if (routing === RoutingDecision.ToolOnly) {
    const toolName = memoryStatus?.activeToolName?.replace("_", " ") || "tool";
    
    if (memoryStatus?.activeToolName === TOOL_IDS.YOUTUBE && memoryStatus?.toolProgress) {
      const status = memoryStatus.toolProgress.status;
      const videoCount = memoryStatus.toolProgress.details?.videoCount || 0;
      const processedCount = memoryStatus.toolProgress.details?.processedCount || 0;
      
      if (status === 'searching') {
        return 'Searching YouTube...';
      } else if (status === 'found') {
        return videoCount > 0 ? `Found ${videoCount} ${videoCount === 1 ? 'video' : 'videos'}` : 'Found videos';
      } else if (status === 'processing_sources') {
        return videoCount > 0 ? `Extracting transcripts (${processedCount}/${videoCount})...` : 'Processing videos...';
      } else if (status === 'completed') {
        return 'Analysis complete';
      }
      return 'Analyzing YouTube videos...';
    }
    
    if (memoryStatus?.toolProgress?.message) {
      return memoryStatus.toolProgress.message;
    }
    
    return `Using ${toolName} to process your request...`;
  }

  const contexts = [];
  if (memoryStatus?.hasDocuments) contexts.push("documents");
  if (memoryStatus?.hasMemories) contexts.push("memories");

  return contexts.length > 0
    ? `Synthesizing response with ${contexts.join(" and ")}...`
    : AI_THINKING_MESSAGES.GENERATING;
}

export type RoutingIconConfig = {
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
      return { icon: Wand, className: "w-3.5 h-3.5 text-blue-500" };
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
    default:
      return "Standard";
  }
}
