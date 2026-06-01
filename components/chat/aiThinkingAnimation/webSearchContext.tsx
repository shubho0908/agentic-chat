import { Search, Loader, CheckCircle2 } from "lucide-react";
import { ToolProgressStatus } from "@/types/chat";
import { VisionContextItem } from "./visionContextItem";
import type { MemoryStatusProps } from "./types";

export function WebSearchContext({ memoryStatus }: MemoryStatusProps) {
  const details = memoryStatus.toolProgress?.details as Record<string, unknown> | undefined;
  const isAdvancedSearch = details?.searchDepth === 'advanced';
  const phase = details?.phase;
  const totalPhases = details?.totalPhases;
  const currentPhase = typeof phase === "number" ? phase : undefined;
  const status = memoryStatus.toolProgress?.status;
  const isCompleted = status === ToolProgressStatus.Completed;

  const label = isAdvancedSearch
    ? "Advanced web search"
    : status === ToolProgressStatus.Searching
      ? "Searching web"
      : status === ToolProgressStatus.Found
        ? `Found ${details?.resultsCount || 0} sources`
        : status === ToolProgressStatus.ProcessingSources
          ? `Processing ${details?.processedCount || 0}/${details?.resultsCount || 0}`
          : isCompleted
            ? `${details?.resultsCount || 0} sources analyzed`
            : "Web search";

  const meta = isAdvancedSearch && currentPhase
    ? `Phase ${currentPhase}/${totalPhases}`
    : isCompleted && details?.resultsCount
      ? `${details.resultsCount} sources`
      : null;

  const sources = memoryStatus.toolProgress?.details?.sources as { domain: string; url: string }[] | undefined;

  return (
    <div className="flex flex-col gap-1.5">
      {memoryStatus.hasImages && (
        <VisionContextItem imageCount={memoryStatus.imageCount} />
      )}

      <div className="flex items-center gap-2 min-w-0">
        <Search className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="text-[12px] font-medium text-foreground/80 truncate">
          {label}
        </span>
        {memoryStatus.toolProgress?.message && isAdvancedSearch && (
          <span className="text-[11px] text-muted-foreground truncate max-w-[180px]">
            {memoryStatus.toolProgress.message}
          </span>
        )}
        <span className="ml-auto flex items-center gap-1.5 shrink-0">
          {meta && (
            <span className="text-[10px] text-muted-foreground">{meta}</span>
          )}
          {isCompleted ? (
            <CheckCircle2 className="size-3 text-muted-foreground/70" />
          ) : (
            <Loader className="size-3 animate-spin text-muted-foreground" />
          )}
        </span>
      </div>

      {sources && sources.length > 0 && (
        <div className="flex items-center gap-1 ml-5.5 flex-wrap">
          {sources.slice(0, 5).map((source, i) => (
            <a
              key={`${source.domain}-${i}`}
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors"
            >
              {source.domain}
            </a>
          ))}
          {sources.length > 5 && (
            <span className="text-[10px] text-muted-foreground">
              +{sources.length - 5} more
            </span>
          )}
        </div>
      )}
    </div>
  );
}
