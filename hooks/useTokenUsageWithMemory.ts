import { useMemo } from 'react';
import type { MemoryStatus, TokenUsage } from '@/types/chat';

interface UseTokenUsageWithMemoryOptions {
  memoryStatus?: MemoryStatus;
  conversationTokenUsage?: TokenUsage;
}

export function useTokenUsageWithMemory({
  memoryStatus,
  conversationTokenUsage,
}: UseTokenUsageWithMemoryOptions) {
  const tokenUsage = useMemo(() => {
    return memoryStatus?.tokenUsage || conversationTokenUsage;
  }, [memoryStatus?.tokenUsage, conversationTokenUsage]);

  const mergedMemoryStatus = useMemo(() => {
    if (!memoryStatus && !tokenUsage) return undefined;
    return {
      hasMemories: memoryStatus?.hasMemories ?? false,
      hasDocuments: memoryStatus?.hasDocuments ?? false,
      memoryCount: memoryStatus?.memoryCount ?? 0,
      documentCount: memoryStatus?.documentCount ?? 0,
      hasImages: memoryStatus?.hasImages ?? false,
      imageCount: memoryStatus?.imageCount ?? 0,
      hasUrls: memoryStatus?.hasUrls ?? false,
      urlCount: memoryStatus?.urlCount ?? 0,
      routingDecision: memoryStatus?.routingDecision,
      skippedMemory: memoryStatus?.skippedMemory,
      activeToolName: memoryStatus?.activeToolName,
      toolProgress: memoryStatus?.toolProgress,
      tokenUsage,
    };
  }, [memoryStatus, tokenUsage]);

  return {
    tokenUsage,
    mergedMemoryStatus,
  };
}
