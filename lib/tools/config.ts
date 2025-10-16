import { Youtube, Telescope, Globe } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export const TOOL_IDS = {
  WEB_SEARCH: 'web_search',
  YOUTUBE: 'youtube',
  DEEP_RESEARCH: 'deep_research',
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
  iconColorClass: string;
}

export const AVAILABLE_TOOLS: Partial<Record<ToolId, ToolConfig>> = {
  [TOOL_IDS.WEB_SEARCH]: {
    id: TOOL_IDS.WEB_SEARCH,
    name: 'Web Search',
    description: 'Search the internet',
    icon: Globe,
    inputPrefix: 'Search the web for: ',
    gradientColors: {
      from: '#22d3ee',
      via: '#3b82f6',
      to: '#4f46e5',
    },
    iconColorClass: 'text-blue-500',
  },
  [TOOL_IDS.YOUTUBE]: {
    id: TOOL_IDS.YOUTUBE,
    name: 'YouTube',
    description: 'Analyze YouTube videos',
    icon: Youtube,
    inputPrefix: 'Paste YouTube link: ',
    gradientColors: {
    from: '#ffffff',
    via: '#ff1a1a',
    to: '#b36a6a',
    },
    iconColorClass: 'text-black dark:text-white',
  },
  [TOOL_IDS.DEEP_RESEARCH]: {
    id: TOOL_IDS.DEEP_RESEARCH,
    name: 'Deep Research',
    description: 'Multi-step comprehensive research',
    icon: Telescope,
    inputPrefix: 'Research topic: ',
    gradientColors: {
      from: '#ffffff',
      via: '#7031ff',
      to: '#6e70db',
    },
    iconColorClass: 'text-black dark:text-white',
  },
};

export function getToolConfig(toolId: ToolId): ToolConfig | undefined {
  return AVAILABLE_TOOLS[toolId];
}

export function isValidToolId(id: string): id is ToolId {
  return Object.values(TOOL_IDS).includes(id as ToolId);
}

export function getToolGradientClasses(toolId: ToolId): string {
  const config = getToolConfig(toolId);
  if (!config) return '';
  return `from-${config.gradientColors.from} via-${config.gradientColors.via} to-${config.gradientColors.to}`;
}
