"use client";

import { useMemo } from "react";
import { RoutingDecision } from "@/types/chat";
import type { ToolActivity } from "@/lib/schemas/chat";
import { AIThinkingAnimationProps } from "./aiThinkingAnimation/types";
import { getContextualMessage } from "./aiThinkingAnimation/utils";
import { RoutingBadge } from "./aiThinkingAnimation/routingBadge";
import { ContextDetails } from "./aiThinkingAnimation/contextDetails";
import { ThinkingMessage } from "./aiThinkingAnimation/thinkingMessage";
import { ToolActivityDisplay } from "./aiThinkingAnimation/toolActivityDisplay";
import { ToolName } from "@/lib/tools/constants";

export function AIThinkingAnimation({ memoryStatus, isLoading, toolActivities }: AIThinkingAnimationProps & { isLoading?: boolean; toolActivities?: ToolActivity[] }) {
  const hasContext =
    memoryStatus &&
    (memoryStatus.hasMemories ||
      memoryStatus.attemptedMemory ||
      memoryStatus.hasDocuments ||
      memoryStatus.hasImages ||
      memoryStatus.routingDecision === RoutingDecision.ToolOnly ||
      memoryStatus.routingDecision === RoutingDecision.MemoryOnly ||
      memoryStatus.routingDecision === RoutingDecision.VisionOnly ||
      memoryStatus.routingDecision === RoutingDecision.DocumentsOnly ||
      memoryStatus.routingDecision === RoutingDecision.Hybrid);

  const hasToolActivities = toolActivities && toolActivities.length > 0;
  const unrepresentedActivities = hasToolActivities
    ? toolActivities.filter((a) => a.toolName !== ToolName.ASK_USER)
    : [];

  const contextualMessage = useMemo(
    () => getContextualMessage(memoryStatus, !!hasContext),
    [hasContext, memoryStatus]
  );

  return (
    <div className="flex flex-col gap-2.5">
      {hasContext && (
        <div className="flex flex-col gap-1 rounded-xl bg-gradient-to-b from-card to-muted/40 p-3 text-xs border border-border/50 shadow-[0_1px_3px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.06)]">
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

      {unrepresentedActivities.length > 0 && (
        <div className="rounded-xl border border-border/60 bg-gradient-to-b from-card to-muted/60 px-3.5 py-2.5 text-xs shadow-[0_1px_3px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.08)]">
          <ToolActivityDisplay toolActivities={unrepresentedActivities} />
        </div>
      )}

      <ThinkingMessage message={contextualMessage} />
    </div>
  );
}
