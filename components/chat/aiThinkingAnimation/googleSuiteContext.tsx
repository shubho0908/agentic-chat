import { Mail, Clock, Search, CheckCircle, AlertCircle, HardDrive, FileText, Calendar, Sheet } from "lucide-react";
import { GoogleSuiteStatus } from "@/types/tools";
import { ContextItem } from "./contextItem";
import { VisionContextItem } from "./visionContextItem";
import type { MemoryStatusProps } from "./types";

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
    
    return "Google Workspace";
  };

  const getStatusLabel = (): string => {
    const serviceName = getServiceName();
    
    switch (status) {
      case GoogleSuiteStatus.INITIALIZING:
        return `Connecting to ${serviceName}`;
      case GoogleSuiteStatus.ANALYZING:
        return "Analyzing request";
      case GoogleSuiteStatus.EXECUTING:
        if (tool) {
          return `${formatToolName(tool)}`;
        }
        if (operation) {
          return `${formatOperation(operation)}`;
        }
        return "Executing operation";
      case GoogleSuiteStatus.COMPLETED:
        return `${serviceName} operation completed`;
      case GoogleSuiteStatus.AUTH_REQUIRED:
        return "Authorization required";
      default:
        return progress?.message || `${serviceName} access`;
    }
  };

  const formatOperation = (op: string): string => {
    return op
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  const formatToolName = (toolName: string): string => {
    const parts = toolName.split("_");
    const service = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
    const action = parts.slice(1).map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(" ");
    
    return `${service}: ${action}`;
  };

  const getServiceIcon = () => {
    if (!tool) return Mail;
    
    if (tool.startsWith('gmail_')) return Mail;
    if (tool.startsWith('drive_')) return HardDrive;
    if (tool.startsWith('docs_')) return FileText;
    if (tool.startsWith('calendar_')) return Calendar;
    if (tool.startsWith('sheets_')) return Sheet;
    
    return Mail;
  };

  const getStatusIcon = () => {
    switch (status) {
      case GoogleSuiteStatus.INITIALIZING:
        return Clock;
      case GoogleSuiteStatus.ANALYZING:
        return Search;
      case GoogleSuiteStatus.EXECUTING:
        return getServiceIcon();
      case GoogleSuiteStatus.COMPLETED:
        return CheckCircle;
      case GoogleSuiteStatus.AUTH_REQUIRED:
        return AlertCircle;
      default:
        return getServiceIcon();
    }
  };

  const getIconColorClass = (): string => {
    switch (status) {
      case GoogleSuiteStatus.AUTH_REQUIRED:
        return "text-amber-600 dark:text-amber-400";
      case GoogleSuiteStatus.COMPLETED:
        return "text-green-600 dark:text-green-400";
      default:
        return "text-blue-600 dark:text-blue-400";
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
          <span className={`text-[10px] px-1.5 py-0.5 rounded bg-${serviceColor}-500/10 text-${serviceColor}-700 dark:text-${serviceColor}-300 font-mono`}>
            {tool ? formatToolName(tool) : operation ? formatOperation(operation) : "Processing"}
          </span>
        </div>
      )}
    </div>
  );
}
