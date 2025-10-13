"use client";

import { useMemo } from "react";
import { RoutingDecision } from "@/types/chat";
import { AIThinkingAnimationProps } from "./aiThinkingAnimation/types";
import { getContextualMessage } from "./aiThinkingAnimation/utils";
import { RoutingBadge } from "./aiThinkingAnimation/routingBadge";
import { ContextDetails } from "./aiThinkingAnimation/contextDetails";
import { ThinkingMessage } from "./aiThinkingAnimation/thinkingMessage";

export function AIThinkingAnimation({ memoryStatus }: AIThinkingAnimationProps) {
  const hasContext =
    memoryStatus &&
    (memoryStatus.hasMemories ||
      memoryStatus.hasDocuments ||
      memoryStatus.hasImages ||
      memoryStatus.routingDecision === RoutingDecision.ToolOnly);

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
            <ContextDetails memoryStatus={memoryStatus} />
          </div>
        </div>
      )}

      <ThinkingMessage message={contextualMessage} />
    </div>
  );
}
