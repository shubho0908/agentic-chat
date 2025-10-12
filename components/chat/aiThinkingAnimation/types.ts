import { MemoryStatus } from "@/hooks/chat/types";

export interface AIThinkingAnimationProps {
  memoryStatus?: MemoryStatus;
}

export const AI_THINKING_MESSAGES = {
  DEFAULT: "Processing your request...",
  GENERATING: "Generating response...",
  VISION_SINGLE: "Analyzing image with focused attention...",
  VISION_MULTIPLE: "Analyzing images with focused attention...",
  MEMORY_SYNTHESIS: "Synthesizing response from conversation history...",
} as const;
