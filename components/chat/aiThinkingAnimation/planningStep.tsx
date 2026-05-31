"use client";

import { LazyMotion, m, domAnimation } from "framer-motion";
import { Route } from "lucide-react";

interface PlanningStepProps {
  message: string;
  plan?: string;
}

export function PlanningStep({ message, plan }: PlanningStepProps) {
  return (
    <LazyMotion features={domAnimation}>
      <m.div
        className="flex w-fit max-w-sm items-start gap-2.5 rounded-lg border border-primary/15 bg-gradient-to-b from-primary/[0.06] to-primary/[0.02] px-3 py-2 text-xs shadow-[0_1px_3px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.08)]"
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        <Route className="mt-0.5 size-3.5 shrink-0 text-primary/70" />
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="font-medium text-foreground/80">{message}</span>
          {plan && (
            <span className="text-muted-foreground/70 truncate">{plan}</span>
          )}
        </div>
      </m.div>
    </LazyMotion>
  );
}
