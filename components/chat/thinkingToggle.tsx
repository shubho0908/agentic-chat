"use client";

import { BrainCircuit } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

interface ThinkingToggleProps {
  enabled: boolean;
  onToggle?: (enabled: boolean) => void;
}

export function ThinkingToggle({ enabled, onToggle }: ThinkingToggleProps) {
  return (
    <div className="p-2 space-y-3">
      <div className="flex items-center justify-between gap-x-3">
        <div className="flex items-center gap-2">
          <div className="relative flex items-center justify-center size-8 rounded-md bg-gradient-to-br from-amber-500/10 via-orange-500/10 to-rose-500/10 group-hover:from-amber-500/20 group-hover:via-orange-500/20 group-hover:to-rose-500/20 transition-colors">
            <BrainCircuit className="size-4 text-amber-700 dark:text-amber-500" />
          </div>
          <Label
            htmlFor="thinking-toggle"
            className="text-sm font-medium cursor-pointer"
          >
            Thinking
          </Label>
        </div>
        <Switch
          id="thinking-toggle"
          checked={enabled}
          onCheckedChange={onToggle}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {enabled
          ? "Show chain-of-thought reasoning with responses"
          : "Respond directly without visible reasoning"}
      </p>
    </div>
  );
}
