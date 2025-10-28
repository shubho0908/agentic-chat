"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, Check, ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { TOOL_IDS, type ToolId, type ToolConfig } from "@/lib/tools/config";
import type { SearchDepth } from "@/lib/schemas/web-search.tools";
import { Button } from "../ui/button";

interface ToolMenuItemDrawerProps {
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
  onToolSelect: (toolId: ToolId) => void;
  onSearchDepthChange?: (depth: SearchDepth) => void;
}

export function ToolMenuItemDrawer({
  tool,
  isActive,
  isAuthenticated,
  searchDepth = 'basic',
  deepResearchUsage,
  googleSuiteStatus,
  onToolSelect,
  onSearchDepthChange,
}: ToolMenuItemDrawerProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const ToolIcon = tool.icon;
  const isDeepResearch = tool.id === TOOL_IDS.DEEP_RESEARCH;
  const isGoogleSuite = tool.id === TOOL_IDS.GOOGLE_SUITE;
  const isWebSearch = tool.id === TOOL_IDS.WEB_SEARCH;
  const isDisabled = !isAuthenticated || (isDeepResearch && !deepResearchUsage?.loading && deepResearchUsage?.remaining === 0);
  const needsPermissions = isGoogleSuite && isAuthenticated && !googleSuiteStatus?.loading && !googleSuiteStatus?.authorized;

  if (isWebSearch) {
    return (
      <div className="space-y-1">
        <Button
          variant="ghost"
          disabled={isDisabled}
          className={cn(
            "w-full flex items-center justify-start gap-3 py-3 px-3 h-auto rounded-lg transition-all",
            isActive && "bg-gradient-to-r from-primary/10 to-primary/5 border-l-2 border-primary",
            "hover:bg-accent",
            isDisabled && "opacity-50 cursor-not-allowed"
          )}
          onClick={() => !isDisabled && setIsExpanded(!isExpanded)}
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
                isActive ? tool.iconColorClass : 'text-muted-foreground'
              )}
            />
          </div>
          <div className="flex flex-col gap-0.5 flex-1 min-w-0 text-left">
            <div className="flex items-center gap-1.5">
              <span className="font-medium truncate">{tool.name}</span>
              <Badge
                variant={searchDepth === 'advanced' ? 'default' : 'outline'}
                className={cn(
                  "text-[10px] py-0 px-1.5 h-4 shrink-0",
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
          <ChevronDown
            className={cn(
              "size-4 text-muted-foreground transition-transform shrink-0",
              isExpanded && "rotate-180"
            )}
          />
          {isActive && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="size-2 rounded-full bg-primary shadow-lg shadow-primary/50 shrink-0"
            />
          )}
        </Button>

        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden pl-3"
            >
              <div className="space-y-1 py-1">
                <Button
                  variant="ghost"
                  disabled={isDisabled}
                  className="w-full flex items-center justify-start gap-3 py-2.5 px-3 h-auto rounded-md hover:bg-accent transition-colors"
                  onClick={() => {
                    if (!isDisabled) {
                      onSearchDepthChange?.('basic');
                      onToolSelect(tool.id);
                      setIsExpanded(false);
                    }
                  }}
                >
                  <div className="flex items-center justify-center size-8 rounded-md bg-muted/50">
                    <Zap className="size-4 text-muted-foreground" />
                  </div>
                  <div className="flex flex-col gap-0.5 flex-1 text-left">
                    <span className="font-medium text-sm">Basic Search</span>
                    <span className="text-xs text-muted-foreground">Quick results, faster response</span>
                  </div>
                  {searchDepth === 'basic' && (
                    <Check className="size-4 text-primary" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  disabled={isDisabled}
                  className="w-full flex items-center justify-start gap-3 py-2.5 px-3 h-auto rounded-md hover:bg-accent transition-colors"
                  onClick={() => {
                    if (!isDisabled) {
                      onSearchDepthChange?.('advanced');
                      onToolSelect(tool.id);
                      setIsExpanded(false);
                    }
                  }}
                >
                  <div className="flex items-center justify-center size-8 rounded-md bg-gradient-to-br from-primary/10 to-primary/5">
                    <Zap fill="yellow" className="size-4 text-primary" />
                  </div>
                  <div className="flex flex-col gap-0.5 flex-1 text-left">
                    <span className="font-medium text-sm">Advanced Search</span>
                    <span className="text-xs text-muted-foreground">Deeper analysis, comprehensive results</span>
                  </div>
                  {searchDepth === 'advanced' && (
                    <Check className="size-4 text-primary" />
                  )}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

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
      onClick={() => !isDisabled && onToolSelect(tool.id)}
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
            isActive ? tool.iconColorClass : 'text-muted-foreground'
          )}
        />
      </div>
      <div className="flex flex-col gap-0.5 flex-1 min-w-0 text-left">
        <div className="flex items-center gap-1.5">
          <span className="font-medium truncate">{tool.name}</span>
          {needsPermissions && (
            <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-4 shrink-0">
              Auth needed
            </Badge>
          )}
        </div>
        <span className="text-xs text-muted-foreground truncate">
          {!isAuthenticated ? 'Login required to access this tool' : needsPermissions ? 'Click to grant Google Workspace permissions' : tool.description}
        </span>
      </div>
      {isActive && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="size-2 rounded-full bg-primary shadow-lg shadow-primary/50 shrink-0"
        />
      )}
    </Button>
  );
}
