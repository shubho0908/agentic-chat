import { Mail, CheckCircle, AlertCircle, HardDrive, FileText, Calendar, Sheet, Presentation, LucideIcon, ChartGantt } from "lucide-react";
import { GoogleSuiteStatus } from "@/types/tools";
import { GoogleIcon } from "@/components/icons/google-icon";
import { getToolDisplayName } from "@/utils/google/tool-names";
import { ContextItem } from "./contextItem";
import { VisionContextItem } from "./visionContextItem";
import type { MemoryStatusProps } from "./types";
import type { ComponentType, SVGProps } from "react";

const SERVICE_BADGE_CLASSES: Record<string, string> = {
  blue: 'bg-blue-500/10 text-blue-700 dark:text-blue-300',
  green: 'bg-green-500/10 text-green-700 dark:text-green-300',
  indigo: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300',
  purple: 'bg-purple-500/10 text-purple-700 dark:text-purple-300',
  emerald: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  amber: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
};

export function GoogleSuiteContext({ memoryStatus }: MemoryStatusProps) {
  const progress = memoryStatus.toolProgress;
  const status = progress?.status as GoogleSuiteStatus;
  const details = progress?.details as Record<string, unknown>;
  const tool = details?.tool as string;
  const operation = details?.operation as string;

  const getServiceName = (): string => {
    if (!tool) return "Google Workspace";
    
    if (tool.startsWith('gmail_')) return "Gmail";
    if (tool.startsWith('drive_')) return "Drive";
    if (tool.startsWith('docs_')) return "Docs";
    if (tool.startsWith('calendar_')) return "Calendar";
    if (tool.startsWith('sheets_')) return "Sheets";
    if (tool.startsWith('slides_')) return "Slides";
    
    return "Google Workspace";
  };

  const getStatusLabel = (): string => {
    const serviceName = getServiceName();
    
    switch (status) {
      case GoogleSuiteStatus.INITIALIZING:
        return `Connecting to Google Workspace`;
      case GoogleSuiteStatus.ANALYZING:
        return "Planning workspace operation";
      case GoogleSuiteStatus.EXECUTING:
        if (tool) {
          return getToolDisplayName(tool);
        }
        if (operation) {
          return formatOperation(operation);
        }
        return progress?.message || "Processing request";
      case GoogleSuiteStatus.COMPLETED:
        return `Workspace task completed`;
      case GoogleSuiteStatus.AUTH_REQUIRED:
        return "Google authorization required";
      default:
        return progress?.message || `Accessing ${serviceName}`;
    }
  };

  const formatOperation = (op: string): string => {
    return op
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  const getServiceIcon = (): LucideIcon => {
    if (!tool) return Mail;
    
    if (tool.startsWith('gmail_')) return Mail;
    if (tool.startsWith('drive_')) return HardDrive;
    if (tool.startsWith('docs_')) return FileText;
    if (tool.startsWith('calendar_')) return Calendar;
    if (tool.startsWith('sheets_')) return Sheet;
    if (tool.startsWith('slides_')) return Presentation;
    
    return Mail;
  };

  const getStatusIcon = (): LucideIcon | ComponentType<SVGProps<SVGSVGElement>> => {
    switch (status) {
      case GoogleSuiteStatus.INITIALIZING:
        return GoogleIcon;
      case GoogleSuiteStatus.ANALYZING:
        return ChartGantt;
      case GoogleSuiteStatus.EXECUTING:
        return getServiceIcon();
      case GoogleSuiteStatus.COMPLETED:
        return CheckCircle;
      case GoogleSuiteStatus.AUTH_REQUIRED:
        return AlertCircle;
      default:
        return GoogleIcon;
    }
  };

  const getIconColorClass = (): string => {
    switch (status) {
      case GoogleSuiteStatus.INITIALIZING:
        return "text-foreground";
      case GoogleSuiteStatus.ANALYZING:
        return "text-foreground";
      case GoogleSuiteStatus.AUTH_REQUIRED:
        return "text-amber-600 dark:text-amber-400";
      case GoogleSuiteStatus.COMPLETED:
        return "text-green-600 dark:text-green-400";
      default:
        return "text-foreground";
    }
  };

  const getLabelColorClass = (): string => {
    switch (status) {
      case GoogleSuiteStatus.AUTH_REQUIRED:
        return "text-amber-700 dark:text-amber-300";
      case GoogleSuiteStatus.COMPLETED:
        return "text-green-700 dark:text-green-300";
      default:
        return "text-blue-700 dark:text-blue-300";
    }
  };

  const StatusIcon = getStatusIcon();
  const hasDetails = (tool || operation) && status === GoogleSuiteStatus.EXECUTING;

  const getServiceColor = (): string => {
    if (!tool) return "blue";
    
    if (tool.startsWith('gmail_')) return "blue";
    if (tool.startsWith('drive_')) return "green";
    if (tool.startsWith('docs_')) return "indigo";
    if (tool.startsWith('calendar_')) return "purple";
    if (tool.startsWith('sheets_')) return "emerald";
    if (tool.startsWith('slides_')) return "amber";
    
    return "blue";
  };

  const serviceColor = getServiceColor();

  return (
    <div className="flex flex-col gap-1.5">
      {memoryStatus.hasImages && (
        <VisionContextItem imageCount={memoryStatus.imageCount} />
      )}
      <ContextItem
        icon={StatusIcon}
        label={getStatusLabel()}
        treeSymbol={hasDetails ? "├─" : "└─"}
        note="(memory skipped)"
        iconClassName={getIconColorClass()}
        labelClassName={getLabelColorClass()}
      />
      {hasDetails && (
        <div className="flex items-center gap-2">
          <span className="text-foreground/40 font-mono text-[10px] select-none">
            └─
          </span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${SERVICE_BADGE_CLASSES[serviceColor] || SERVICE_BADGE_CLASSES.blue}`}>
            {tool ? getToolDisplayName(tool) : operation ? formatOperation(operation) : "Processing"}
          </span>
        </div>
      )}
    </div>
  );
}
