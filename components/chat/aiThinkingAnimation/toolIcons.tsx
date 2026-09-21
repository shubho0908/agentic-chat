import { createElement } from "react";
import { Globe, Plug, Presentation, Search } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { FC, SVGProps } from "react";
import {
  GmailIcon,
  GoogleCalendarIcon,
  GoogleDocsIcon,
  GoogleDriveIcon,
  GoogleSheetsIcon,
  GitHubIcon,
  LinearIcon,
  NotionIcon,
  SlackIcon,
} from "../connectorIcons";
import type { ToolIconKey } from "./toolActivityMeta";

type IconComponent = LucideIcon | FC<SVGProps<SVGSVGElement>>;

const TOOL_ICONS: Record<ToolIconKey, IconComponent> = {
  search: Search,
  globe: Globe,
  research: Search,
  gmail: GmailIcon,
  calendar: GoogleCalendarIcon,
  drive: GoogleDriveIcon,
  docs: GoogleDocsIcon,
  sheets: GoogleSheetsIcon,
  slides: Presentation,
  slack: SlackIcon,
  notion: NotionIcon,
  github: GitHubIcon,
  linear: LinearIcon,
  tool: Plug,
};

interface ToolIconProps {
  icon: ToolIconKey;
  className?: string;
}

export function ToolIcon({ icon, className }: ToolIconProps) {
  return createElement(TOOL_ICONS[icon], { className, "aria-hidden": true });
}
