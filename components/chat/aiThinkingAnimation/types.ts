import type { MemoryStatus } from "@/types/chat";

export interface AIThinkingAnimationProps {
  memoryStatus?: MemoryStatus;
}

export interface MemoryStatusProps {
  memoryStatus: MemoryStatus;
}

export interface ContextDetailsProps extends MemoryStatusProps {
  isLoading?: boolean;
}

export interface HybridContextProps {
  imageCount: number;
  documentCount: number;
}

export interface VisionOnlyContextProps {
  imageCount: number;
}

export interface VisionContextItemProps {
  imageCount: number;
  treeSymbol?: "├─" | "└─";
}

export const AI_THINKING_MESSAGES = {
  DEFAULT: "Processing your request...",
  GENERATING: "Generating response...",
  VISION_SINGLE: "Analyzing image with focused attention...",
  VISION_MULTIPLE: "Analyzing images with focused attention...",
  MEMORY_SYNTHESIS: "Synthesizing response from conversation history...",
} as const;
