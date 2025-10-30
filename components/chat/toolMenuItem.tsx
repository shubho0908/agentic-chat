"use client";

import { motion } from "framer-motion";
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
import { TOOL_IDS, type ToolId, type ToolConfig } from "@/lib/tools/config";
import type { SearchDepth } from "@/lib/schemas/web-search.tools";
import { GOOGLE_SUITE_SERVICES } from "@/components/icons/google-suite-icons";

interface ToolMenuItemProps {
  tool: ToolConfig;
  isActive: boolean;
  isAuthenticated: boolean;
  searchDepth?: SearchDepth;
  deepResearchUsage?: {
    remaining: number;
    limit: number;
    loading: boolean;
  };
  googleSuiteStatus?: {
    authorized: boolean;
    loading: boolean;
  };
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
  const ToolIcon = tool.icon;
  const isDeepResearch = tool.id === TOOL_IDS.DEEP_RESEARCH;
  const isGoogleSuite = tool.id === TOOL_IDS.GOOGLE_SUITE;
  const isWebSearch = tool.id === TOOL_IDS.WEB_SEARCH;
  const isDisabled = !isAuthenticated || 
    (isDeepResearch && !deepResearchUsage?.loading && deepResearchUsage?.remaining === 0) ||
    (isGoogleSuite && !googleSuiteStatus?.loading && !googleSuiteStatus?.authorized);
  const needsPermissions = isGoogleSuite && isAuthenticated && !googleSuiteStatus?.loading && !googleSuiteStatus?.authorized;

  if (isWebSearch) {
    return (
      <DropdownMenuSub>
        <DropdownMenuSubTrigger
          disabled={isDisabled}
          className={cn(
            "gap-3 py-3 rounded-lg transition-all",
            !isDisabled && "cursor-pointer group",
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
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="ml-auto size-2 rounded-full bg-primary shadow-lg shadow-primary/50"
            />
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
      onClick={() => !isDisabled && onToolSelect(tool.id)}
      disabled={isDisabled}
      className={cn(
        "gap-3 py-3 rounded-lg transition-all",
        !isDisabled && "cursor-pointer group",
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
          {needsPermissions && (
            <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-4 shrink-0">
              Sign in required
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
                  <div className="space-y-2">
                    <p className="font-medium text-sm">Available Tools</p>
                    <div className="grid grid-cols-3 gap-2">
                      {GOOGLE_SUITE_SERVICES.map((service) => {
                        const ServiceIcon = service.icon;
                        return (
                          <div
                            key={service.name}
                            className="flex flex-col items-center gap-1.5 p-2 rounded-lg hover:bg-accent/70 transition-colors cursor-pointer"
                          >
                            <div className="size-8 flex items-center justify-center">
                              <ServiceIcon className="size-7" />
                            </div>
                            <span className="text-[10px] font-medium text-center">
                              {service.name}
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
          {!isAuthenticated ? 'Login required to access this tool' : needsPermissions ? 'Sign in with Google to access Workspace tools' : tool.description}
        </span>
      </div>
      {isActive && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="ml-auto size-2 rounded-full bg-primary shadow-lg shadow-primary/50"
        />
      )}
    </DropdownMenuItem>
  );
}