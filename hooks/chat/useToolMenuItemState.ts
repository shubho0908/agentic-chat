"use client";

import type { MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { TOOL_IDS, type ToolConfig } from "@/lib/tools/config";
import { GOOGLE_SIGN_IN_SCOPES } from "@/lib/tools/google-suite/scopes";
import { resolveGoogleWorkspaceSelections } from "@/lib/tools/google-suite/accessLevels";

export interface ToolMenuDeepResearchUsage {
  remaining: number;
  limit: number;
  loading: boolean;
}

export interface ToolMenuGoogleSuiteStatus {
  authorized: boolean;
  loading: boolean;
  workspaceConnected: boolean;
  hasWorkspaceAccess: boolean;
  grantedScopes: string[];
}

interface UseToolMenuItemStateArgs {
  tool: ToolConfig;
  isAuthenticated: boolean;
  deepResearchUsage?: ToolMenuDeepResearchUsage;
  googleSuiteStatus?: ToolMenuGoogleSuiteStatus;
}

export function useToolMenuItemState({
  tool,
  isAuthenticated,
  deepResearchUsage,
  googleSuiteStatus,
}: UseToolMenuItemStateArgs) {
  const router = useRouter();
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
    !googleSuiteStatus?.workspaceConnected;
  const isDisabled =
    !isAuthenticated ||
    (isDeepResearch && !deepResearchUsage?.loading && deepResearchUsage?.remaining === 0) ||
    (isGoogleSuite && !!googleSuiteStatus?.loading);
  const needsPermissions =
    isGoogleSuite &&
    isAuthenticated &&
    !googleSuiteStatus?.loading &&
    !!googleSuiteStatus?.workspaceConnected &&
    !hasWorkspaceAccess;
  const googleWorkspaceSelections = resolveGoogleWorkspaceSelections(
    googleSuiteStatus?.grantedScopes ?? []
  );
  const toolDescription = !isAuthenticated
    ? "Login required to access this tool"
    : googleSuiteNeedsSetup
      ? "Enable at least one Google app in Settings before using Google Suite."
      : needsPermissions
        ? "Choose Google access in Settings before using Gmail, Drive, Calendar, Docs, Sheets, or Slides."
        : tool.description;

  const openGoogleSettings = () => {
    router.push("/settings/google-workspace");
  };

  const handleOpenGoogleSettings = (event?: MouseEvent<HTMLElement>) => {
    event?.preventDefault();
    event?.stopPropagation();
    openGoogleSettings();
  };

  return {
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
  };
}
