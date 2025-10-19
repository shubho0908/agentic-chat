"use client";

import { useMemo } from "react";
import { RoutingDecision } from "@/types/chat";
import { AIThinkingAnimationProps } from "./aiThinkingAnimation/types";
import { getContextualMessage } from "./aiThinkingAnimation/utils";
import { RoutingBadge } from "./aiThinkingAnimation/routingBadge";
import { ContextDetails } from "./aiThinkingAnimation/contextDetails";
import { ThinkingMessage } from "./aiThinkingAnimation/thinkingMessage";

export function AIThinkingAnimation({ memoryStatus, isLoading }: AIThinkingAnimationProps & { isLoading?: boolean }) {
  const researchSkipped = memoryStatus?.toolProgress?.details?.skipped === true;
  
  const hasContext =
    memoryStatus &&
    !researchSkipped &&
    (memoryStatus.hasMemories ||
      memoryStatus.hasDocuments ||
      memoryStatus.hasImages ||
      memoryStatus.hasUrls ||
      memoryStatus.routingDecision === RoutingDecision.ToolOnly ||
      memoryStatus.routingDecision === RoutingDecision.MemoryOnly ||
      memoryStatus.routingDecision === RoutingDecision.VisionOnly ||
      memoryStatus.routingDecision === RoutingDecision.DocumentsOnly ||
      memoryStatus.routingDecision === RoutingDecision.Hybrid ||
      memoryStatus.routingDecision === RoutingDecision.UrlContent);

  const contextualMessage = useMemo(
    () => getContextualMessage(memoryStatus, !!hasContext),
    [hasContext, memoryStatus]
  );

  return (
    <div className="flex flex-col gap-2.5">
      {hasContext && (
        <div className="flex flex-col gap-1 rounded-lg bg-muted/30 p-3 text-xs border border-border/50">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-foreground/70 font-semibold">
              Context retrieved:
            </span>
            <RoutingBadge routingDecision={memoryStatus.routingDecision} />
          </div>

          <div className="flex flex-col gap-1.5">
            <ContextDetails memoryStatus={memoryStatus} isLoading={isLoading} />
          </div>
        </div>
      )}

      <ThinkingMessage message={contextualMessage} />
    </div>
  );
}
