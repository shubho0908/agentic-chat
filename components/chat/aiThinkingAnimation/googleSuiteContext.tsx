import { Mail, CheckCircle, AlertCircle, HardDrive, FileText, Calendar, Sheet, Presentation, LucideIcon, ChartGantt, Lightbulb, CheckCheck, ListChecks, ListTodo } from "lucide-react";
import { GoogleSuiteStatus, type GoogleSuiteTask } from "@/types/tools";
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
  const currentTask = details?.currentTask as GoogleSuiteTask | undefined;
  const allTasks = details?.allTasks as GoogleSuiteTask[] | undefined;
  const completedTasks = details?.completedTasks as GoogleSuiteTask[] | undefined;
  const thinking = details?.thinking as string | undefined;
  const planning = details?.planning as { toolsToUse: string[]; estimatedSteps: number } | undefined;
  const totalCompleted = details?.totalCompleted as number | undefined;
  const completedInIteration = details?.completedInIteration as number | undefined;

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
        return "Analyzing request and planning actions";
      case GoogleSuiteStatus.PLANNING:
        if (planning) {
          return `Planning complete: ${planning.estimatedSteps} action(s) to execute`;
        }
        return "Planning workspace operations";
      case GoogleSuiteStatus.THINKING:
        if (thinking) {
          return thinking.length > 80 ? thinking.substring(0, 80) + '...' : thinking;
        }
        return "Analyzing results and planning next steps";
      case GoogleSuiteStatus.TASK_START:
        if (currentTask) {
          return `Starting: ${currentTask.description}`;
        }
        return "Starting task";
      case GoogleSuiteStatus.EXECUTING:
        if (currentTask) {
          return `${currentTask.description}`;
        }
        if (tool) {
          return getToolDisplayName(tool);
        }
        if (operation) {
          return formatOperation(operation);
        }
        return progress?.message || "Processing request";
      case GoogleSuiteStatus.TASK_COMPLETE:
        if (currentTask) {
          return `✓ Completed: ${currentTask.description}`;
        }
        return "Task completed";
      case GoogleSuiteStatus.VALIDATING:
        if (completedInIteration !== undefined && completedInIteration > 0) {
          return `Validating ${completedInIteration} completed task${completedInIteration !== 1 ? 's' : ''}`;
        }
        if (totalCompleted !== undefined && totalCompleted > 0) {
          return `Validating ${totalCompleted} completed task${totalCompleted !== 1 ? 's' : ''}`;
        }
        return "Validating task completion";
      case GoogleSuiteStatus.COMPLETED:
        const taskCount = completedTasks?.length || allTasks?.filter(t => t.status === 'completed').length || 0;
        return `Workspace task completed (${taskCount} action${taskCount !== 1 ? 's' : ''})`;
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
      case GoogleSuiteStatus.PLANNING:
        return ListTodo;
      case GoogleSuiteStatus.THINKING:
        return Lightbulb;
      case GoogleSuiteStatus.TASK_START:
        return ListChecks;
      case GoogleSuiteStatus.EXECUTING:
        return getServiceIcon();
      case GoogleSuiteStatus.TASK_COMPLETE:
        return CheckCheck;
      case GoogleSuiteStatus.VALIDATING:
        return ChartGantt;
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
      case GoogleSuiteStatus.TASK_COMPLETE:
        return "text-green-700 dark:text-green-300";
      default:
        return "text-blue-700 dark:text-blue-300";
    }
  };

  const StatusIcon = getStatusIcon();
  const showTaskDetails = allTasks && allTasks.length > 0 &&
    [GoogleSuiteStatus.EXECUTING, GoogleSuiteStatus.TASK_START, GoogleSuiteStatus.TASK_COMPLETE, GoogleSuiteStatus.VALIDATING, GoogleSuiteStatus.COMPLETED].includes(status);
  const showPlanningDetails = planning && status === GoogleSuiteStatus.PLANNING;
  const showThinkingDetails = thinking && status === GoogleSuiteStatus.THINKING;
  const hasSubItems = showTaskDetails || showPlanningDetails || showThinkingDetails;

  return (
    <div className="flex flex-col gap-1.5">
      {memoryStatus.hasImages && (
        <VisionContextItem imageCount={memoryStatus.imageCount} />
      )}
      <ContextItem
        icon={StatusIcon}
        label={getStatusLabel()}
        treeSymbol={hasSubItems ? "├─" : "└─"}
        iconClassName={getIconColorClass()}
        labelClassName={getLabelColorClass()}
      />

      {showPlanningDetails && planning && (
        <div className="flex flex-col gap-1 ml-4">
          {planning.toolsToUse.map((toolName, index) => {
            const isLast = index === planning.toolsToUse.length - 1;
            const serviceColor = getServiceColorForTool(toolName);
            return (
              <div key={index} className="flex items-center gap-2">
                <span className="text-foreground/40 font-mono text-[10px] select-none">
                  {isLast ? "└─" : "├─"}
                </span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${SERVICE_BADGE_CLASSES[serviceColor] || SERVICE_BADGE_CLASSES.blue}`}>
                  {getToolDisplayName(toolName)}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {showThinkingDetails && thinking && thinking.length > 80 && (
        <div className="flex items-center gap-2 ml-4">
          <span className="text-foreground/40 font-mono text-[10px] select-none">
            └─
          </span>
          <span className="text-[10px] text-foreground/60 italic">
            {thinking}
          </span>
        </div>
      )}

      {showTaskDetails && allTasks && (
        <div className="flex flex-col gap-1 ml-4">
          {allTasks.map((task, index) => {
            const isLast = index === allTasks.length - 1;
            const serviceColor = getServiceColorForTool(task.tool);
            const taskStatusIcon = task.status === 'completed' ? '✓' :
              task.status === 'failed' ? '✗' :
                task.status === 'in_progress' ? '▸' : '○';
            const taskStatusColor = task.status === 'completed' ? 'text-green-600 dark:text-green-400' :
              task.status === 'failed' ? 'text-red-600 dark:text-red-400' :
                task.status === 'in_progress' ? 'text-blue-600 dark:text-blue-400' :
                  'text-foreground/40';

            return (
              <div key={task.id} className="flex items-center gap-2">
                <span className="text-foreground/40 font-mono text-[10px] select-none">
                  {isLast ? "└─" : "├─"}
                </span>
                <span className={`text-[10px] font-mono ${taskStatusColor}`}>
                  {taskStatusIcon}
                </span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${SERVICE_BADGE_CLASSES[serviceColor] || SERVICE_BADGE_CLASSES.blue}`}>
                  {task.description}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function getServiceColorForTool(toolName: string): string {
  if (toolName.startsWith('gmail_')) return "blue";
  if (toolName.startsWith('drive_')) return "green";
  if (toolName.startsWith('docs_')) return "indigo";
  if (toolName.startsWith('calendar_')) return "purple";
  if (toolName.startsWith('sheets_')) return "emerald";
  if (toolName.startsWith('slides_')) return "amber";
  return "blue";
}
