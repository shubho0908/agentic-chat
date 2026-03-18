"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LazyMotion, domAnimation, m, AnimatePresence } from "framer-motion";
import { Zap, Check, ChevronDown, Settings2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { TOOL_IDS, type ToolId, type ToolConfig } from "@/lib/tools/config";
import type { SearchDepth } from "@/lib/schemas/webSearchTools";
import { Button } from "../ui/button";
import { GOOGLE_SIGN_IN_SCOPES } from "@/lib/tools/google-suite/scopes";

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
    workspaceConnected: boolean;
    hasWorkspaceAccess: boolean;
    grantedScopes: string[];
  };
  onToolSelect: (toolId: ToolId, selectedDepth?: SearchDepth) => void;
}

export function ToolMenuItemDrawer({
  tool,
  isActive,
  isAuthenticated,
  searchDepth = 'basic',
  deepResearchUsage,
  googleSuiteStatus,
  onToolSelect,
}: ToolMenuItemDrawerProps) {
  const router = useRouter();
  const [isExpanded, setIsExpanded] = useState(false);
  const ToolIcon = tool.icon;
  const isDeepResearch = tool.id === TOOL_IDS.DEEP_RESEARCH;
  const isGoogleSuite = tool.id === TOOL_IDS.GOOGLE_SUITE;
  const isWebSearch = tool.id === TOOL_IDS.WEB_SEARCH;
  const signInScopes = new Set<string>(GOOGLE_SIGN_IN_SCOPES);
  const hasWorkspaceAccess = googleSuiteStatus?.hasWorkspaceAccess ?? (googleSuiteStatus?.grantedScopes ?? []).some(
    (scope) => !signInScopes.has(scope)
  );
  const googleSuiteNeedsSetup =
    isGoogleSuite &&
    isAuthenticated &&
    !googleSuiteStatus?.loading &&
    !hasWorkspaceAccess;
  const isDisabled =
    !isAuthenticated ||
    (isDeepResearch && !deepResearchUsage?.loading && deepResearchUsage?.remaining === 0) ||
    (isGoogleSuite && !!googleSuiteStatus?.loading);
  const needsPermissions =
    isGoogleSuite &&
    isAuthenticated &&
    !googleSuiteStatus?.loading &&
    !hasWorkspaceAccess;

  const handleOpenGoogleSettings = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    router.push("/settings/google-workspace");
  };

  if (isWebSearch) {
    return (
      <LazyMotion features={domAnimation}>
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
            <m.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="size-2 rounded-full bg-primary shadow-lg shadow-primary/50 shrink-0"
            />
          )}
        </Button>

        <AnimatePresence>
          {isExpanded && (
            <m.div
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
                      onToolSelect(tool.id, 'basic');
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
                  {isActive && searchDepth === 'basic' && (
                    <Check className="size-4 text-primary" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  disabled={isDisabled}
                  className="w-full flex items-center justify-start gap-3 py-2.5 px-3 h-auto rounded-md hover:bg-accent transition-colors"
                  onClick={() => {
                    if (!isDisabled) {
                      onToolSelect(tool.id, 'advanced');
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
                  {isActive && searchDepth === 'advanced' && (
                    <Check className="size-4 text-primary" />
                  )}
                </Button>
              </div>
            </m.div>
          )}
        </AnimatePresence>
        </div>
      </LazyMotion>
    );
  }

  return (
    <Button
      variant="ghost"
      disabled={isDisabled}
      className={cn(
        "w-full flex items-center justify-start gap-3 py-3 px-3 h-auto rounded-lg transition-all",
        (isDisabled || googleSuiteNeedsSetup) && "opacity-50 cursor-not-allowed",
        isActive && "bg-gradient-to-r from-primary/10 to-primary/5 border-l-2 border-primary",
        !isDisabled && !googleSuiteNeedsSetup && "hover:bg-accent"
      )}
      onClick={() => {
        if (googleSuiteNeedsSetup) {
          router.push("/settings/google-workspace");
          return;
        }

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
            isActive ? tool.iconColorClass : 'text-muted-foreground'
          )}
        />
      </div>
      <div className="flex flex-col gap-0.5 flex-1 min-w-0 text-left">
        <div className="flex items-center gap-1.5">
          <span className="font-medium truncate">{tool.name}</span>
          {(needsPermissions || googleSuiteNeedsSetup) && (
            <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-4 shrink-0">
              {googleSuiteNeedsSetup ? "Enable first" : hasWorkspaceAccess ? "Limited" : "Setup"}
            </Badge>
          )}
          {isGoogleSuite && (
            <button
              type="button"
              onClick={handleOpenGoogleSettings}
              className="inline-flex h-5 items-center rounded-md border border-border/70 px-1.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Settings2 className="mr-1 size-3" />
              Settings
            </button>
          )}
        </div>
        <span className="text-xs text-muted-foreground truncate">
          {!isAuthenticated
            ? 'Login required to access this tool'
            : googleSuiteNeedsSetup
              ? 'Enable at least one Google app in Settings before using Google Suite.'
            : needsPermissions
              ? 'Choose Google access in Settings before using Gmail, Drive, Calendar, Docs, Sheets, or Slides.'
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
