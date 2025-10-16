import { Eye, FileText, Brain, Search, Wand, Youtube } from "lucide-react";
import type { MemoryStatus } from "@/types/chat";
import { RoutingDecision, ToolProgressStatus } from "@/types/chat";
import { TOOL_IDS } from "@/lib/tools/config";
import { ContextItem } from "./contextItem";
import { isToolActive } from "./utils";
import { DeepResearchTimeline } from "./deepResearchTimeline";

interface ContextDetailsProps {
  memoryStatus: MemoryStatus;
  isLoading?: boolean;
}

export function ContextDetails({ memoryStatus }: ContextDetailsProps) {
  const isWebSearch = isToolActive(memoryStatus, TOOL_IDS.WEB_SEARCH);
  const isYouTube = isToolActive(memoryStatus, TOOL_IDS.YOUTUBE);
  const isDeepResearch = isToolActive(memoryStatus, TOOL_IDS.DEEP_RESEARCH);

  if (isDeepResearch) {
    const progress = memoryStatus.toolProgress;
    const details = progress?.details;
    const progressStatus = details?.status || progress?.status;

    if (progressStatus === 'gate_skip') {
      return null;
    }

    const visionContextItem = memoryStatus.hasImages ? (
      <ContextItem
        icon={Eye}
        label={
          memoryStatus.imageCount > 0
            ? `${memoryStatus.imageCount} ${memoryStatus.imageCount === 1 ? "image" : "images"}`
            : "Vision analysis"
        }
        treeSymbol="├─"
        iconClassName="text-cyan-600 dark:text-cyan-400"
        labelClassName="text-cyan-700 dark:text-cyan-300"
      />
    ) : null;

    const timelineSteps = [];
    
    const isAfterGate = progressStatus && !['gate_check', 'gate_skip'].includes(progressStatus);
    timelineSteps.push({
      label: 'Query Analysis',
      status: (isAfterGate ? 'completed' : progressStatus === 'gate_check' ? 'current' : 'pending') as 'completed' | 'current' | 'pending' | 'failed',
      details: isAfterGate ? 'Deep research needed' : undefined,
    });

    const hasResearchPlan = details?.researchPlan && details.researchPlan.length > 0;
    const isAfterPlanning = progressStatus && !['gate_check', 'planning'].includes(progressStatus);
    const researchPlanLength = details?.researchPlan?.length ?? 0;
    timelineSteps.push({
      label: hasResearchPlan ? `Planning (${researchPlanLength} tasks)` : 'Planning',
      status: (isAfterPlanning ? 'completed' : progressStatus === 'planning' ? 'current' : 'pending') as 'completed' | 'current' | 'pending' | 'failed',
      details: hasResearchPlan && isAfterPlanning ? `${researchPlanLength} research tasks created` : undefined,
      data: { researchPlan: details?.researchPlan },
    });

    const isResearching = ['task_start', 'task_progress', 'task_complete'].includes(progressStatus || '');
    const currentTaskIndex = details?.currentTaskIndex ?? 0;
    const totalTasks = details?.totalTasks ?? details?.researchPlan?.length ?? 0;
    const completedTasks = details?.completedTasks || [];
    const isAfterResearch = completedTasks.length > 0 && !isResearching;
    
    timelineSteps.push({
      label: isResearching 
        ? `Research (${Math.min(currentTaskIndex + 1, totalTasks)}/${totalTasks})`
        : completedTasks.length > 0 
          ? `Research (${completedTasks.length}/${totalTasks} completed)`
          : 'Research',
      status: (isAfterResearch ? 'completed' : isResearching ? 'current' : 'pending') as 'completed' | 'current' | 'pending' | 'failed',
      details: isAfterResearch ? `${completedTasks.length} tasks completed` : undefined,
      data: { completedTasks },
    });

    const isAfterAggregating = progressStatus && !['gate_check', 'planning', 'task_start', 'task_progress', 'task_complete', 'aggregating'].includes(progressStatus);
    timelineSteps.push({
      label: 'Synthesizing',
      status: (isAfterAggregating ? 'completed' : progressStatus === 'aggregating' ? 'current' : 'pending') as 'completed' | 'current' | 'pending' | 'failed',
      details: isAfterAggregating ? 'Findings combined' : undefined,
    });

    const hasEvaluation = details?.evaluationResult;
    const isAfterEvaluation = hasEvaluation && progressStatus !== 'evaluating' && progressStatus !== 'retrying';
    const evaluationScore = details?.evaluationResult?.score;
    const evaluationMeetsStandards = details?.evaluationResult?.meetsStandards;
    timelineSteps.push({
      label: hasEvaluation && evaluationScore !== undefined
        ? `Quality Check`
        : progressStatus === 'retrying'
          ? 'Quality Check (retrying)'
          : 'Quality Check',
      status: (isAfterEvaluation ? 'completed' : (progressStatus === 'evaluating' || progressStatus === 'retrying') ? 'current' : 'pending') as 'completed' | 'current' | 'pending' | 'failed',
      details: hasEvaluation && isAfterEvaluation
        ? evaluationMeetsStandards
          ? 'Quality standards met'
          : 'Proceeding with current quality'
        : undefined,
      data: { evaluationResult: details?.evaluationResult },
    });

    timelineSteps.push({
      label: 'Formatting Report',
      status: (progressStatus === 'completed' ? 'completed' : progressStatus === 'formatting' ? 'current' : 'pending') as 'completed' | 'current' | 'pending' | 'failed',
      details: progressStatus === 'completed' ? 'Report ready' : undefined,
    });

    let currentTaskDetails: { question?: string; tools?: string[] } | undefined = undefined;
    if (isResearching && details?.researchPlan && details.researchPlan.length > 0) {
      const safeCurrentIndex = Math.min(currentTaskIndex, totalTasks - 1);
      const currentTask = details.researchPlan[safeCurrentIndex];
      if (currentTask) {
        currentTaskDetails = {
          question: currentTask.question,
          tools: currentTask.tools || []
        };
      }
    }

    return (
      <>
        {visionContextItem}
        <DeepResearchTimeline 
          steps={timelineSteps} 
          currentTaskIndex={currentTaskIndex}
          totalTasks={totalTasks}
          currentTaskDetails={currentTaskDetails}
        />
      </>
    );
  }

  if (
    memoryStatus.hasImages &&
    memoryStatus.routingDecision !== RoutingDecision.Hybrid
  ) {
    return (
      <ContextItem
        icon={Eye}
        label={
          memoryStatus.imageCount > 0
            ? `${memoryStatus.imageCount} ${memoryStatus.imageCount === 1 ? "image" : "images"
            }`
            : "Vision analysis"
        }
        treeSymbol="└─"
        note="(text context skipped)"
        iconClassName="text-cyan-600 dark:text-cyan-400"
        labelClassName="text-cyan-700 dark:text-cyan-300"
      />
    );
  }

  if (memoryStatus.routingDecision === RoutingDecision.ToolOnly) {
    if (isWebSearch) {
      return (
        <div className="flex flex-col gap-1.5">
          {memoryStatus.hasImages && (
            <ContextItem
              icon={Eye}
              label={
                memoryStatus.imageCount > 0
                  ? `${memoryStatus.imageCount} ${memoryStatus.imageCount === 1 ? "image" : "images"}`
                  : "Vision analysis"
              }
              treeSymbol="├─"
              iconClassName="text-cyan-600 dark:text-cyan-400"
              labelClassName="text-cyan-700 dark:text-cyan-300"
            />
          )}
          <ContextItem
            icon={Search}
            label={
              memoryStatus.toolProgress?.status === ToolProgressStatus.Searching
                ? "Searching web"
                : memoryStatus.toolProgress?.status === ToolProgressStatus.Found
                  ? `Found ${memoryStatus.toolProgress.details?.resultsCount || 0} sources`
                  : memoryStatus.toolProgress?.status ===
                    ToolProgressStatus.ProcessingSources
                    ? `Processing ${memoryStatus.toolProgress.details?.processedCount || 0}/${memoryStatus.toolProgress.details?.resultsCount || 0}`
                    : memoryStatus.toolProgress?.status === ToolProgressStatus.Completed
                      ? `${memoryStatus.toolProgress.details?.resultsCount || 0} sources analyzed`
                      : "Web search"
            }
            treeSymbol={
              memoryStatus.toolProgress?.details?.sources &&
                memoryStatus.toolProgress.details.sources.length > 0
                ? "├─"
                : "└─"
            }
            note="(memory skipped)"
            iconClassName="text-blue-600 dark:text-blue-400"
            labelClassName="text-blue-700 dark:text-blue-300"
          />
          {memoryStatus.toolProgress?.details?.sources &&
            memoryStatus.toolProgress.details.sources.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-foreground/40 font-mono text-[10px] select-none">
                  └─
                </span>
                <div className="flex flex-wrap gap-1 items-center">
                  {memoryStatus.toolProgress.details.sources
                    .slice(0, 5)
                    .map((source, idx) => (
                      <span
                        key={idx}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-700 dark:text-blue-300 font-mono"
                      >
                        {source.domain}
                      </span>
                    ))}
                  {memoryStatus.toolProgress.details.sources.length > 5 && (
                    <span className="text-[10px] text-foreground/50">
                      +{memoryStatus.toolProgress.details.sources.length - 5} more
                    </span>
                  )}
                </div>
              </div>
            )}
        </div>
      );
    }

    if (isYouTube) {
      return (
        <div className="flex flex-col gap-1.5">
          {memoryStatus.hasImages && (
            <ContextItem
              icon={Eye}
              label={
                memoryStatus.imageCount > 0
                  ? `${memoryStatus.imageCount} ${memoryStatus.imageCount === 1 ? "image" : "images"}`
                  : "Vision analysis"
              }
              treeSymbol="├─"
              iconClassName="text-cyan-600 dark:text-cyan-400"
              labelClassName="text-cyan-700 dark:text-cyan-300"
            />
          )}
          <ContextItem
            icon={Youtube}
            label={memoryStatus.toolProgress?.message || "YouTube analysis"}
            treeSymbol={
              memoryStatus.toolProgress?.details?.videos &&
                memoryStatus.toolProgress.details.videos.length > 0
                ? "├─"
                : "└─"
            }
            note="(memory skipped)"
            iconClassName="text-red-600 dark:text-red-400"
            labelClassName="text-red-700 dark:text-red-300"
          />
          {memoryStatus.toolProgress?.details?.videos &&
            memoryStatus.toolProgress.details.videos.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-foreground/40 font-mono text-[10px] select-none">
                  └─
                </span>
                <div className="flex flex-wrap gap-1 items-center">
                  {memoryStatus.toolProgress.details.videos
                    .slice(0, 3)
                    .map((video, idx) => (
                      <span
                        key={idx}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-700 dark:text-red-300 font-mono truncate max-w-[120px]"
                        title={video.title}
                      >
                        {video.title}
                      </span>
                    ))}
                  {memoryStatus.toolProgress.details.videos.length > 3 && (
                    <span className="text-[10px] text-foreground/50">
                      +{memoryStatus.toolProgress.details.videos.length - 3} more
                    </span>
                  )}
                </div>
              </div>
            )}
        </div>
      );
    }

    return (
      <>
        {memoryStatus.hasImages && (
          <ContextItem
            icon={Eye}
            label={
              memoryStatus.imageCount > 0
                ? `${memoryStatus.imageCount} ${memoryStatus.imageCount === 1 ? "image" : "images"}`
                : "Vision analysis"
            }
            treeSymbol="├─"
            iconClassName="text-cyan-600 dark:text-cyan-400"
            labelClassName="text-cyan-700 dark:text-cyan-300"
          />
        )}
        <ContextItem
          icon={Wand}
          label={
            memoryStatus.activeToolName
              ? `${memoryStatus.activeToolName.replace("_", " ")} tool`
              : "Tool active"
          }
          treeSymbol="└─"
          note="(memory skipped)"
          iconClassName="text-blue-600 dark:text-blue-400"
          labelClassName="text-blue-700 dark:text-blue-300"
        />
      </>
    );
  }

  if (memoryStatus.routingDecision === RoutingDecision.Hybrid) {
    return (
      <>
        <ContextItem
          icon={Eye}
          label={
            memoryStatus.imageCount > 0
              ? `${memoryStatus.imageCount} ${memoryStatus.imageCount === 1 ? "image" : "images"
              }`
              : "Vision analysis"
          }
          treeSymbol="├─"
          iconClassName="text-cyan-600 dark:text-cyan-400"
          labelClassName="text-cyan-700 dark:text-cyan-300"
        />
        <ContextItem
          icon={FileText}
          label={
            memoryStatus.documentCount > 0
              ? `${memoryStatus.documentCount} attached ${memoryStatus.documentCount === 1 ? "doc" : "docs"
              }`
              : "Document context"
          }
          treeSymbol="└─"
          iconClassName="text-amber-600 dark:text-amber-400"
          labelClassName="text-amber-700 dark:text-amber-300"
        />
      </>
    );
  }

  return (
    <>
      {memoryStatus.hasDocuments && (
        <ContextItem
          icon={FileText}
          label={
            memoryStatus.documentCount > 0
              ? `${memoryStatus.documentCount} attached ${memoryStatus.documentCount === 1 ? "doc" : "docs"
              }`
              : "Searching documents"
          }
          treeSymbol={!memoryStatus.hasMemories ? "└─" : "├─"}
          iconClassName="text-amber-600 dark:text-amber-400"
          labelClassName="text-amber-700 dark:text-amber-300"
        />
      )}

      {memoryStatus.hasMemories && (
        <ContextItem
          icon={Brain}
          label={
            memoryStatus.memoryCount > 0
              ? `${memoryStatus.memoryCount} ${memoryStatus.memoryCount === 1 ? "memory" : "memories"
              } (past chats)`
              : "Searching memories"
          }
          treeSymbol="└─"
          iconClassName="text-indigo-600 dark:text-indigo-400"
          labelClassName="text-indigo-700 dark:text-indigo-300"
        />
      )}

      {memoryStatus.skippedMemory && !memoryStatus.hasMemories && (
        <ContextItem
          icon={Brain}
          label="Memories"
          treeSymbol="└─"
          note="(skipped - focused mode)"
          iconClassName="text-gray-400 dark:text-gray-500"
          labelClassName="text-gray-500 dark:text-gray-400"
          skipped
        />
      )}
    </>
  );
}
