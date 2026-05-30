import type { LucideIcon } from "lucide-react";
import type { ComponentType, SVGProps } from "react";

export const TOOL_IDS = {} as const;

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

export const AVAILABLE_TOOLS: Partial<Record<ToolId, ToolConfig>> = {};

export function parseToolId(id: string | null | undefined): ToolId | null {
  if (!id) {
    return null;
  }
  return null;
}
