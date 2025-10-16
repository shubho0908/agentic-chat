import { Youtube } from "lucide-react";
import { ContextItem } from "./contextItem";
import { VisionContextItem } from "./visionContextItem";
import type { MemoryStatusProps } from "./types";

export function YouTubeContext({ memoryStatus }: MemoryStatusProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {memoryStatus.hasImages && (
        <VisionContextItem imageCount={memoryStatus.imageCount} />
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
