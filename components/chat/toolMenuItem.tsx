"use client";

import { cn } from "@/lib/utils";
import { DropdownMenuItem } from "@/components/ui/dropdownMenu";
import { type ToolId, type ToolConfig } from "@/lib/tools/config";

interface ToolMenuItemProps {
  tool: ToolConfig;
  isActive: boolean;
  isAuthenticated: boolean;
  onToolSelect: (toolId: ToolId) => void;
}

export function ToolMenuItem({
  tool,
  isActive,
  isAuthenticated,
  onToolSelect,
}: ToolMenuItemProps) {
  const ToolIcon = tool.icon;
  const isDisabled = !isAuthenticated;
  const toolDescription = !isAuthenticated
    ? "Login required to access this tool"
    : tool.description;

  return (
    <DropdownMenuItem
      onClick={() => {
        if (!isDisabled) {
          onToolSelect(tool.id);
        }
      }}
      disabled={isDisabled}
      aria-disabled={isDisabled}
      className={cn(
        "gap-3 py-3 rounded-lg transition-all duration-200 ease-out",
        !isDisabled && "cursor-pointer group active:scale-[0.98]",
        isDisabled && "opacity-50",
        isActive && "bg-gradient-to-r from-primary/10 to-primary/5 border-l-2 border-primary"
      )}
    >
      <div
        className={cn(
          "relative flex items-center justify-center size-9 rounded-lg transition-all",
          !isDisabled && "group-hover:scale-110"
        )}
        style={{
          background: `linear-gradient(135deg, ${tool.gradientColors.from}20, ${tool.gradientColors.via}30, ${tool.gradientColors.to}20)`,
        }}
      >
        <ToolIcon
          className={cn(
            "size-4 transition-colors",
            isActive ? tool.iconColorClass : 'text-muted-foreground',
            !isDisabled && "group-hover:text-foreground"
          )}
        />
      </div>
      <div className="flex flex-col gap-0.5 flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-medium truncate">{tool.name}</span>
        </div>
        <span className="text-xs text-muted-foreground truncate">
          {toolDescription}
        </span>
      </div>
      {isActive && (
        <div className="ml-auto size-2 rounded-full bg-primary shadow-lg shadow-primary/50 animate-in fade-in-0 zoom-in-95 duration-200" />
      )}
    </DropdownMenuItem>
  );
}
