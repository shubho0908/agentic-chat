"use client";

import { X } from "lucide-react";
import { getToolConfig, type ToolId } from "@/lib/tools/config";

interface ActiveToolBadgeProps {
  toolId: ToolId;
  onRemove: () => void;
}

export function ActiveToolBadge({ toolId, onRemove }: ActiveToolBadgeProps) {
  const tool = getToolConfig(toolId);
  const ToolIcon = tool.icon;

  const handleRemove = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    onRemove();
  };

  return (
    <div
      className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium bg-muted/80 border border-border/60"
    >
      <ToolIcon 
        className={`size-3.5 ${tool.iconColorClass}`}
      />
      <span className="text-foreground">{tool.name}</span>
      <button
        type="button"
        onClick={handleRemove}
        className="ml-1 rounded-full p-0.5 hover:bg-background/50 transition-colors"
        aria-label={`Deactivate ${tool.name}`}
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
