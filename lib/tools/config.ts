import { Search } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export const TOOL_IDS = {
  WEB_SEARCH: 'web_search',
} as const;

export type ToolId = typeof TOOL_IDS[keyof typeof TOOL_IDS];

export interface ToolConfig {
  id: ToolId;
  name: string;
  description: string;
  icon: LucideIcon;
  inputPrefix?: string;
  gradientColors: {
    from: string;
    via: string;
    to: string;
  };
  iconColor: string;
  iconColorClass: string;
}

export const AVAILABLE_TOOLS: Record<ToolId, ToolConfig> = {
  [TOOL_IDS.WEB_SEARCH]: {
    id: TOOL_IDS.WEB_SEARCH,
    name: 'Web Search',
    description: 'Search the internet',
    icon: Search,
    inputPrefix: 'Search the web for: ',
    gradientColors: {
      from: '#22d3ee',
      via: '#3b82f6', 
      to: '#4f46e5',
    },
    iconColor: '#3b82f6',
    iconColorClass: 'text-blue-500',
  },
};

export function getToolConfig(toolId: ToolId): ToolConfig {
  return AVAILABLE_TOOLS[toolId];
}

export function isValidToolId(id: string): id is ToolId {
  return Object.values(TOOL_IDS).includes(id as ToolId);
}

export function getToolGradientClasses(toolId: ToolId): string {
  const config = getToolConfig(toolId);
  return `from-${config.gradientColors.from} via-${config.gradientColors.via} to-${config.gradientColors.to}`;
}
