"use client";

import { Brain } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

interface MemoryToggleProps {
  enabled: boolean;
  onToggle?: (enabled: boolean) => void;
}

export function MemoryToggle({ enabled, onToggle }: MemoryToggleProps) {
  return (
    <div className="px-2 py-2 space-y-3">
      <div className="flex items-center justify-between space-x-3">
        <div className="flex items-center gap-2">
          <div className="relative flex items-center justify-center size-8 rounded-md bg-gradient-to-br from-green-500/10 via-emerald-500/10 to-teal-500/10 group-hover:from-green-500/20 group-hover:via-emerald-500/20 group-hover:to-teal-500/20 transition-colors">
            <Brain className="size-4 text-green-800 dark:text-green-600" />
          </div>
          <Label
            htmlFor="memory-toggle"
            className="text-sm font-medium cursor-pointer"
          >
            Memory
          </Label>
        </div>
        <Switch
          id="memory-toggle"
          checked={enabled}
          onCheckedChange={onToggle}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {enabled
          ? "AI will remember context from past conversations"
          : "AI will not access conversation history"}
      </p>
    </div>
  );
}
