"use client";

import { LazyMotion, domAnimation, m } from "framer-motion";
import { cn } from "@/lib/utils";
import { type ToolId, type ToolConfig } from "@/lib/tools/config";
import { Button } from "../ui/button";

interface ToolMenuItemDrawerProps {
  tool: ToolConfig;
  isActive: boolean;
  isAuthenticated: boolean;
  onToolSelect: (toolId: ToolId) => void;
}

export function ToolMenuItemDrawer({
  tool,
  isActive,
  isAuthenticated,
  onToolSelect,
}: ToolMenuItemDrawerProps) {
  const ToolIcon = tool.icon;
  const isDisabled = !isAuthenticated;

  return (
    <Button
      variant="ghost"
      disabled={isDisabled}
      className={cn(
        "w-full flex items-center justify-start gap-3 py-3 px-3 h-auto rounded-lg transition-all",
        isDisabled && "opacity-50 cursor-not-allowed",
        isActive && "bg-gradient-to-r from-primary/10 to-primary/5 border-l-2 border-primary",
        !isDisabled && "hover:bg-accent"
      )}
      onClick={() => {
        if (!isDisabled) {
          onToolSelect(tool.id);
        }
      }}
    >
      <div
        className="relative flex items-center justify-center size-9 rounded-lg transition-all"
        style={{
          background: `linear-gradient(135deg, ${tool.gradientColors.from}20, ${tool.gradientColors.via}30, ${tool.gradientColors.to}20)`,
        }}
      >
        <ToolIcon
          className={cn(
            "size-4 transition-colors",
            isActive ? tool.iconColorClass : "text-muted-foreground"
          )}
        />
      </div>
      <div className="flex flex-col gap-0.5 flex-1 min-w-0 text-left">
        <div className="flex items-center gap-1.5">
          <span className="font-medium truncate">{tool.name}</span>
        </div>
        <span className="text-xs text-muted-foreground truncate">
          {!isAuthenticated
            ? "Login required to access this tool"
            : tool.description}
        </span>
      </div>
      {isActive && (
        <LazyMotion features={domAnimation}>
          <m.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="size-2 rounded-full bg-primary shadow-lg shadow-primary/50 shrink-0"
          />
        </LazyMotion>
      )}
    </Button>
  );
}
