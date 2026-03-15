"use client";

import { Info, Zap, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { type ToolId, type ToolConfig } from "@/lib/tools/config";
import type { SearchDepth } from "@/lib/schemas/web-search.tools";
import { GOOGLE_SUITE_SERVICES } from "@/components/icons/google-suite-icons";
import { getGoogleWorkspaceLevel } from "@/lib/tools/google-suite/access-levels";
import {
  useToolMenuItemState,
  type ToolMenuDeepResearchUsage,
  type ToolMenuGoogleSuiteStatus,
} from "@/hooks/chat/useToolMenuItemState";

interface ToolMenuItemProps {
  tool: ToolConfig;
  isActive: boolean;
  isAuthenticated: boolean;
  searchDepth?: SearchDepth;
  deepResearchUsage?: ToolMenuDeepResearchUsage;
  googleSuiteStatus?: ToolMenuGoogleSuiteStatus;
  onToolSelect: (toolId: ToolId, selectedDepth?: SearchDepth) => void;
}

export function ToolMenuItem({
  tool,
  isActive,
  isAuthenticated,
  searchDepth = 'basic',
  deepResearchUsage,
  googleSuiteStatus,
  onToolSelect,
}: ToolMenuItemProps) {
  const {
    ToolIcon,
    googleWorkspaceSelections,
    handleOpenGoogleSettings,
    hasWorkspaceAccess,
    isDeepResearch,
    isDisabled,
    isGoogleSuite,
    isWebSearch,
    needsPermissions,
    googleSuiteNeedsSetup,
    openGoogleSettings,
    toolDescription,
  } = useToolMenuItemState({
    tool,
    isAuthenticated,
    deepResearchUsage,
    googleSuiteStatus,
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
        if (googleSuiteNeedsSetup) {
          openGoogleSettings();
          return;
        }

        if (!isDisabled) {
          onToolSelect(tool.id);
        }
      }}
      disabled={isDisabled}
      aria-disabled={isDisabled || googleSuiteNeedsSetup}
      className={cn(
        "gap-3 py-3 rounded-lg transition-all duration-200 ease-out",
        !isDisabled && !googleSuiteNeedsSetup && "cursor-pointer group active:scale-[0.98]",
        (isDisabled || googleSuiteNeedsSetup) && "opacity-50",
        googleSuiteNeedsSetup && "cursor-not-allowed",
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
          {(needsPermissions || googleSuiteNeedsSetup) && (
            <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-4 shrink-0">
              {googleSuiteNeedsSetup ? "Enable first" : hasWorkspaceAccess ? "Limited" : "Setup"}
            </Badge>
          )}
          {isDeepResearch && (
            <TooltipProvider>
              <Tooltip delayDuration={200}>
                <TooltipTrigger asChild>
                  <Info
                    className="size-3.5 text-muted-foreground hover:text-foreground transition-colors cursor-help shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  />
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs">
                  <div className="space-y-1">
                    <p className="font-medium">
                      {deepResearchUsage?.loading ? (
                        "Loading usage..."
                      ) : deepResearchUsage?.remaining === 0 ? (
                        "Limit Reached"
                      ) : (
                        "Usage Information"
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {!isAuthenticated ? (
                        "Please login to use this tool. Deep Research performs comprehensive research across multiple sources to provide in-depth analysis."
                      ) : deepResearchUsage?.loading ? (
                        "Please wait..."
                      ) : deepResearchUsage?.remaining === 0 ? (
                        `You've used all ${deepResearchUsage?.limit} deep research queries this month. Resets next month.`
                      ) : (
                        `${deepResearchUsage?.remaining} of ${deepResearchUsage?.limit} deep research queries remaining this month.`
                      )}
                    </p>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {isGoogleSuite && (
            <TooltipProvider>
              <Tooltip delayDuration={200}>
                <TooltipTrigger asChild>
                  <Info
                    className="size-3.5 text-muted-foreground hover:text-foreground transition-colors cursor-help shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  />
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs p-3">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium text-sm">Available Tools</p>
                      <button
                        type="button"
                        className="text-[10px] font-medium text-primary hover:underline"
                        onClick={handleOpenGoogleSettings}
                      >
                        Open Settings
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {GOOGLE_SUITE_SERVICES.map((service) => {
                        const ServiceIcon = service.icon;
                        const serviceId = service.name.toLowerCase() as keyof typeof googleWorkspaceSelections;
                        const levelId = googleWorkspaceSelections[serviceId];
                        const level = getGoogleWorkspaceLevel(serviceId, levelId);
                        const isEnabled = level.id !== "off";

                        return (
                          <div
                            key={service.name}
                            className="flex aspect-square w-full flex-col items-center justify-center gap-1.5 rounded-lg p-2 transition-colors hover:bg-accent/70"
                          >
                            <div className="relative flex size-8 items-center justify-center">
                              <ServiceIcon className="size-7" />
                              <span
                                className={cn(
                                  "absolute -right-0.5 -top-0.5 size-2 rounded-full border border-popover",
                                  isEnabled ? "bg-emerald-500" : "bg-muted-foreground/40"
                                )}
                              />
                            </div>
                            <span className="text-[10px] font-medium text-center">
                              {service.name}
                            </span>
                            <span className="text-[9px] text-muted-foreground text-center">
                              {isEnabled ? level.label : "Off"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
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
