"use client";

import { Zap, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdownMenu";
import { type ToolId, type ToolConfig } from "@/lib/tools/config";
import type { SearchDepth } from "@/lib/schemas/webSearchTools";
import {
  useToolMenuItemState,
} from "@/hooks/chat/useToolMenuItemState";

interface ToolMenuItemProps {
  tool: ToolConfig;
  isActive: boolean;
  isAuthenticated: boolean;
  searchDepth?: SearchDepth;
  onToolSelect: (toolId: ToolId, selectedDepth?: SearchDepth) => void;
}

export function ToolMenuItem({
  tool,
  isActive,
  isAuthenticated,
  searchDepth = 'basic',
  onToolSelect,
}: ToolMenuItemProps) {
  const {
    ToolIcon,
    isDisabled,
    isWebSearch,
    toolDescription,
  } = useToolMenuItemState({
    tool,
    isAuthenticated,
  });

  if (isWebSearch) {
    return (
      <DropdownMenuSub>
        <DropdownMenuSubTrigger
          disabled={isDisabled}
          className={cn(
            "gap-3 py-3 rounded-lg transition-all duration-200 ease-out",
            !isDisabled && "cursor-pointer group active:scale-[0.98]",
            isActive && "bg-gradient-to-r from-primary/10 to-primary/5 border-l-2 border-primary",
            isDisabled && "opacity-50"
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
              <Badge
                variant={searchDepth === 'advanced' ? 'default' : 'outline'}
                className={cn(
                  "text-[10px] py-0 px-1.5 h-4 shrink-0 hover:bg-secondary",
                  searchDepth === 'advanced' && "bg-primary/20 text-primary border-primary/30"
                )}
              >
                {searchDepth === 'advanced' ? 'Advanced' : 'Basic'}
              </Badge>
            </div>
            <span className="text-xs text-muted-foreground truncate">
              {tool.description}
            </span>
          </div>
          {isActive && (
            <div className="ml-auto size-2 rounded-full bg-primary shadow-lg shadow-primary/50 animate-in fade-in-0 zoom-in-95 duration-200" />
          )}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent sideOffset={8} className="w-56 p-1">
          <DropdownMenuItem
            onClick={() => {
              if (!isDisabled) {
                onToolSelect(tool.id, 'basic');
              }
            }}
            disabled={isDisabled}
            className={cn(
              "gap-3 py-2.5 rounded-md",
              !isDisabled && "cursor-pointer"
            )}
          >
            <div className="flex items-center justify-center size-8 rounded-md bg-muted/50">
              <Zap className="size-4 text-muted-foreground" />
            </div>
            <div className="flex flex-col gap-0.5 flex-1">
              <span className="font-medium text-sm">Basic Search</span>
              <span className="text-xs text-muted-foreground">Quick results, faster response</span>
            </div>
            {isActive && searchDepth === 'basic' && (
              <Check className="size-4 text-primary ml-auto" />
            )}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              if (!isDisabled) {
                onToolSelect(tool.id, 'advanced');
              }
            }}
            disabled={isDisabled}
            className={cn(
              "gap-3 py-2.5 rounded-md",
              !isDisabled && "cursor-pointer"
            )}
          >
            <div className="flex items-center justify-center size-8 rounded-md bg-gradient-to-br from-primary/10 to-primary/5">
              <Zap fill="yellow" className="size-4 text-primary" />
            </div>
            <div className="flex flex-col gap-0.5 flex-1">
              <span className="font-medium text-sm">Advanced Search</span>
              <span className="text-xs text-muted-foreground">Deeper analysis, comprehensive results</span>
            </div>
            {isActive && searchDepth === 'advanced' && (
              <Check className="size-4 text-primary ml-auto" />
            )}
          </DropdownMenuItem>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    );
  }

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
