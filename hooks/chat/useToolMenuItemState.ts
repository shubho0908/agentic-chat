"use client";

import { TOOL_IDS, type ToolConfig } from "@/lib/tools/config";

interface UseToolMenuItemStateArgs {
  tool: ToolConfig;
  isAuthenticated: boolean;
}

export function useToolMenuItemState({
  tool,
  isAuthenticated,
}: UseToolMenuItemStateArgs) {
  const ToolIcon = tool.icon;
  const isWebSearch = tool.id === TOOL_IDS.WEB_SEARCH;
  const isDisabled = !isAuthenticated;
  const toolDescription = !isAuthenticated
    ? "Login required to access this tool"
    : tool.description;

  return {
    ToolIcon,
    isDisabled,
    isWebSearch,
    toolDescription,
  };
}
