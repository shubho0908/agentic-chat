"use client";

import { Route, Loader } from "lucide-react";

interface PlanningStepProps {
  message: string;
  plan?: string;
}

export function PlanningStep({ message, plan }: PlanningStepProps) {
  return (
    <div className="rounded-xl border border-border/60 bg-gradient-to-b from-card to-muted/60 px-3.5 py-2.5 text-xs shadow-[0_1px_3px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.08)]">
      <div className="flex items-center gap-2 min-w-0">
        <Route className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="text-[12px] font-medium text-foreground/80 truncate">
          {message}
        </span>
        {plan && (
          <span className="text-[11px] text-muted-foreground truncate max-w-[180px]">
            {plan}
          </span>
        )}
        <span className="ml-auto shrink-0">
          <Loader className="size-3 animate-spin text-muted-foreground" />
        </span>
      </div>
    </div>
  );
}
