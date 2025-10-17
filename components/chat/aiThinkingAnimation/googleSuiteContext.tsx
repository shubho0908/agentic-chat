import { Mail, Clock, Search, CheckCircle, AlertCircle } from "lucide-react";
import { GoogleSuiteStatus } from "@/types/tools";
import { ContextItem } from "./contextItem";
import { VisionContextItem } from "./visionContextItem";
import type { MemoryStatusProps } from "./types";

export function GoogleSuiteContext({ memoryStatus }: MemoryStatusProps) {
  const progress = memoryStatus.toolProgress;
  const status = progress?.status as GoogleSuiteStatus;
  const operation = progress?.details?.operation;

  const getStatusLabel = (): string => {
    switch (status) {
      case GoogleSuiteStatus.INITIALIZING:
        return "Connecting to Gmail";
      case GoogleSuiteStatus.ANALYZING:
        return "Analyzing request";
      case GoogleSuiteStatus.EXECUTING:
        if (operation) {
          return `${formatOperation(operation)}`;
        }
        return "Executing operation";
      case GoogleSuiteStatus.COMPLETED:
        return "Operation completed";
      case GoogleSuiteStatus.AUTH_REQUIRED:
        return "Authorization required";
      default:
        return progress?.message || "Gmail access";
    }
  };

  const formatOperation = (op: string): string => {
    return op
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  const getStatusIcon = () => {
    switch (status) {
      case GoogleSuiteStatus.INITIALIZING:
        return Clock;
      case GoogleSuiteStatus.ANALYZING:
        return Search;
      case GoogleSuiteStatus.EXECUTING:
        return Mail;
      case GoogleSuiteStatus.COMPLETED:
        return CheckCircle;
      case GoogleSuiteStatus.AUTH_REQUIRED:
        return AlertCircle;
      default:
        return Mail;
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
  const hasDetails = operation && status === GoogleSuiteStatus.EXECUTING;

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
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-700 dark:text-blue-300 font-mono">
            {formatOperation(operation)}
          </span>
        </div>
      )}
    </div>
  );
}
