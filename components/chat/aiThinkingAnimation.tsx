"use client";

import { useMemo } from "react";
import { RoutingDecision } from "@/types/chat";
import type { ToolActivity } from "@/lib/schemas/chat";
import { AIThinkingAnimationProps } from "./aiThinkingAnimation/types";
import { getContextualMessage } from "./aiThinkingAnimation/utils";
import { ContextDetails } from "./aiThinkingAnimation/contextDetails";
import { ThinkingMessage } from "./aiThinkingAnimation/thinkingMessage";
import { ToolActivityDisplay } from "./aiThinkingAnimation/toolActivityDisplay";
import { ToolName } from "@/lib/tools/constants";

export function AIThinkingAnimation({ memoryStatus, toolActivities }: AIThinkingAnimationProps & { toolActivities?: ToolActivity[] }) {
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
        <div className="relative isolate overflow-hidden rounded-xl border border-black/[0.08] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(244,244,247,0.94))] px-3.5 py-2.5 text-xs shadow-[0_1px_0_rgba(255,255,255,0.9)_inset,0_-1px_0_rgba(15,23,42,0.04)_inset,0_1px_2px_rgba(15,23,42,0.06),0_4px_10px_-4px_rgba(15,23,42,0.08)] dark:border-white/[0.08] dark:bg-[linear-gradient(180deg,rgba(33,36,44,0.98),rgba(22,24,29,0.98))] dark:shadow-[0_1px_0_rgba(255,255,255,0.06)_inset,0_-1px_0_rgba(0,0,0,0.4)_inset,0_1px_2px_rgba(0,0,0,0.4),0_8px_20px_-6px_rgba(0,0,0,0.45)]">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/70 to-transparent dark:via-white/10"
          />
          <div className="flex flex-col gap-2">
            <ContextDetails memoryStatus={memoryStatus} />
          </div>
        </div>
      )}

      {unrepresentedActivities.length > 0 && (
        <div className="relative isolate overflow-hidden rounded-xl border border-black/[0.08] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(244,244,247,0.94))] px-3.5 py-2.5 text-xs shadow-[0_1px_0_rgba(255,255,255,0.9)_inset,0_-1px_0_rgba(15,23,42,0.04)_inset,0_1px_2px_rgba(15,23,42,0.06),0_4px_10px_-4px_rgba(15,23,42,0.08)] dark:border-white/[0.08] dark:bg-[linear-gradient(180deg,rgba(33,36,44,0.98),rgba(22,24,29,0.98))] dark:shadow-[0_1px_0_rgba(255,255,255,0.06)_inset,0_-1px_0_rgba(0,0,0,0.4)_inset,0_1px_2px_rgba(0,0,0,0.4),0_8px_20px_-6px_rgba(0,0,0,0.45)]">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/70 to-transparent dark:via-white/10"
          />
          <ToolActivityDisplay toolActivities={unrepresentedActivities} />
        </div>
      )}

      <ThinkingMessage message={contextualMessage} />
    </div>
  );
}
