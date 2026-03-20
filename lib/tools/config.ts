import { Telescope, Globe } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import { GoogleIcon } from "@/components/icons/googleIcon";

export const TOOL_IDS = {
  WEB_SEARCH: 'web_search',
  DEEP_RESEARCH: 'deep_research',
  GOOGLE_SUITE: 'google_suite',
} as const;

export type ToolId = typeof TOOL_IDS[keyof typeof TOOL_IDS];

export interface ToolConfig {
  id: ToolId;
  name: string;
  description: string;
  icon: LucideIcon | ComponentType<SVGProps<SVGSVGElement>>;
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
  [TOOL_IDS.GOOGLE_SUITE]: {
    id: TOOL_IDS.GOOGLE_SUITE,
    name: 'Google Suite',
    description: 'Smart agent for Google Suite',
    icon: GoogleIcon,
    inputPrefix: 'Gmail request: ',
    gradientColors: {
      from: '#4285F4',
      via: '#DB4437',
      to: '#F4B400',
    },
    iconColorClass: 'text-blue-600',
  },
};

function isValidToolId(id: string): id is ToolId {
  return Object.values(TOOL_IDS).includes(id as ToolId);
}

export function parseToolId(id: string | null | undefined): ToolId | null {
  if (!id) {
    return null;
  }

  return isValidToolId(id) ? id : null;
}
