import { Eye, FileText, Brain, Search, Wand, Youtube } from "lucide-react";
import type { MemoryStatus } from "@/types/chat";
import { RoutingDecision } from "@/types/chat";
import { WebSearchProgressStatus } from "@/types/tools";
import { ContextItem } from "./contextItem";
import { TOOL_IDS } from "@/lib/tools/config";

interface ContextDetailsProps {
  memoryStatus: MemoryStatus;
}

export function ContextDetails({ memoryStatus }: ContextDetailsProps) {
  const isWebSearch = memoryStatus.toolProgress?.toolName === TOOL_IDS.WEB_SEARCH;
  const isYouTube = memoryStatus.toolProgress?.toolName === TOOL_IDS.YOUTUBE;

  if (
    memoryStatus.hasImages &&
    memoryStatus.routingDecision !== RoutingDecision.Hybrid
  ) {
    return (
      <ContextItem
        icon={Eye}
        label={
          memoryStatus.imageCount > 0
            ? `${memoryStatus.imageCount} ${
                memoryStatus.imageCount === 1 ? "image" : "images"
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
          <ContextItem
            icon={Search}
            label={
              memoryStatus.toolProgress?.status === WebSearchProgressStatus.Searching
                ? "Searching web"
                : memoryStatus.toolProgress?.status === WebSearchProgressStatus.Found
                ? `Found ${memoryStatus.toolProgress.details?.resultsCount || 0} sources`
                : memoryStatus.toolProgress?.status ===
                  WebSearchProgressStatus.ProcessingSources
                ? `Processing ${memoryStatus.toolProgress.details?.processedCount || 0}/${memoryStatus.toolProgress.details?.resultsCount || 0}`
                : memoryStatus.toolProgress?.status === WebSearchProgressStatus.Completed
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
      <ContextItem
        icon={Wand}
        label="Tools available"
        treeSymbol="└─"
        note="(AI can call tools as needed)"
        iconClassName="text-blue-600 dark:text-blue-400"
        labelClassName="text-blue-700 dark:text-blue-300"
      />
    );
  }

  if (memoryStatus.routingDecision === RoutingDecision.Hybrid) {
    return (
      <>
        <ContextItem
          icon={Eye}
          label={
            memoryStatus.imageCount > 0
              ? `${memoryStatus.imageCount} ${
                  memoryStatus.imageCount === 1 ? "image" : "images"
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
              ? `${memoryStatus.documentCount} attached ${
                  memoryStatus.documentCount === 1 ? "doc" : "docs"
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
              ? `${memoryStatus.documentCount} attached ${
                  memoryStatus.documentCount === 1 ? "doc" : "docs"
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
              ? `${memoryStatus.memoryCount} ${
                  memoryStatus.memoryCount === 1 ? "memory" : "memories"
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
