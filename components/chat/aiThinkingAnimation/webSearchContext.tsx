import { Search, Target, Network, ShieldCheck, Boxes, BadgeCheck } from "lucide-react";
import { ToolProgressStatus } from "@/types/chat";
import { ContextItem } from "./contextItem";
import { VisionContextItem } from "./visionContextItem";
import type { MemoryStatusProps } from "./types";

export function WebSearchContext({ memoryStatus }: MemoryStatusProps) {
  const isAdvancedSearch = memoryStatus.toolProgress?.details?.searchDepth === 'advanced';
  const currentPhase = memoryStatus.toolProgress?.details?.phase as number | undefined;
  const totalPhases = memoryStatus.toolProgress?.details?.totalPhases as number | undefined;

  if (isAdvancedSearch && currentPhase) {
    const phases = [
      {
        number: 1,
        icon: Target,
        label: 'Query Analysis',
        description: 'Analyzing query and decomposing research questions',
        color: 'text-purple-600 dark:text-purple-400',
        bgColor: 'bg-purple-500/10',
      },
      {
        number: 2,
        icon: Network,
        label: 'Web Crawling',
        description: 'Searching 10-15 comprehensive web sources',
        color: 'text-blue-600 dark:text-blue-400',
        bgColor: 'bg-blue-500/10',
      },
      {
        number: 3,
        icon: ShieldCheck,
        label: 'Cross-Verification',
        description: 'Comparing and verifying information across sources',
        color: 'text-cyan-600 dark:text-cyan-400',
        bgColor: 'bg-cyan-500/10',
      },
      {
        number: 4,
        icon: Boxes,
        label: 'Synthesis',
        description: 'Synthesizing comprehensive analysis',
        color: 'text-amber-600 dark:text-amber-400',
        bgColor: 'bg-amber-500/10',
      },
      {
        number: 5,
        icon: BadgeCheck,
        label: 'Validation',
        description: 'Final quality check and polish',
        color: 'text-green-600 dark:text-green-400',
        bgColor: 'bg-green-500/10',
      },
    ];

    const currentPhaseData = phases[currentPhase - 1];

    return (
      <div className="flex flex-col gap-2">
        {memoryStatus.hasImages && (
          <VisionContextItem imageCount={memoryStatus.imageCount} />
        )}

        {/* Advanced Search Header */}
        <div className="flex items-center gap-2">
          <span className="text-foreground/40 font-mono text-[10px] select-none">└─</span>
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center size-4 rounded-full bg-gradient-to-br from-purple-500/20 to-blue-500/20">
              <Search className="size-2.5 text-blue-600 dark:text-blue-400" />
            </div>
            <span className="text-[11px] font-medium text-blue-700 dark:text-blue-300">
              Advanced Web Search
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 font-mono">
              Phase {currentPhase}/{totalPhases}
            </span>
          </div>
        </div>

        {/* Current Phase with Icon and Description */}
        {currentPhaseData && (
          <div className="flex items-start gap-2 ml-6">
            <span className="text-foreground/40 font-mono text-[10px] select-none mt-0.5">└─</span>
            <div className={`flex items-center justify-center size-5 rounded-md ${currentPhaseData.bgColor}`}>
              <currentPhaseData.icon className={`size-3 ${currentPhaseData.color}`} />
            </div>
            <div className="flex flex-col gap-0.5">
              <span className={`text-[11px] font-medium ${currentPhaseData.color}`}>
                {currentPhaseData.label}
              </span>
              <span className="text-[10px] text-foreground/60">
                {memoryStatus.toolProgress?.message || currentPhaseData.description}
              </span>
            </div>
          </div>
        )}

        {/* Sources Display (Phase 3 onwards) */}
        {currentPhase >= 3 && memoryStatus.toolProgress?.details?.sources &&
          memoryStatus.toolProgress.details.sources.length > 0 && (
            <div className="flex items-start gap-2 ml-6">
              <span className="text-foreground/40 font-mono text-[10px] select-none mt-0.5">└─</span>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-foreground/60">
                  Analyzing {memoryStatus.toolProgress.details.sources.length} sources:
                </span>
                <div className="flex flex-wrap gap-1 items-center">
                  {memoryStatus.toolProgress.details.sources
                    .slice(0, 6)
                    .map((source, idx) => (
                      <span
                        key={idx}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-700 dark:text-blue-300 font-mono"
                      >
                        {source.domain}
                      </span>
                    ))}
                  {memoryStatus.toolProgress.details.sources.length > 6 && (
                    <span className="text-[10px] text-foreground/50">
                      +{memoryStatus.toolProgress.details.sources.length - 6} more
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {memoryStatus.hasImages && (
        <VisionContextItem imageCount={memoryStatus.imageCount} />
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
