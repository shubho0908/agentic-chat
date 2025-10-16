import { Search } from "lucide-react";
import { ToolProgressStatus } from "@/types/chat";
import { ContextItem } from "./contextItem";
import { VisionContextItem } from "./visionContextItem";
import type { MemoryStatusProps } from "./types";

export function WebSearchContext({ memoryStatus }: MemoryStatusProps) {
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
