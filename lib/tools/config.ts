import type { LucideIcon } from "lucide-react";
import type { ComponentType, SVGProps } from "react";

export type ToolId = string;

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

export const AVAILABLE_TOOLS: Record<ToolId, ToolConfig> = {};
