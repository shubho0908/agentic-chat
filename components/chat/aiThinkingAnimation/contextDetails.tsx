import { Eye, FileText, Brain, Search, Wand } from "lucide-react";
import type { MemoryStatus } from "@/types/chat";
import { RoutingDecision, ToolProgressStatus } from "@/types/chat";
import { TOOL_IDS } from "@/lib/tools/config";
import { ContextItem } from "./contextItem";
import { isToolActive } from "./utils";

interface ContextDetailsProps {
  memoryStatus: MemoryStatus;
}

export function ContextDetails({ memoryStatus }: ContextDetailsProps) {
  const isWebSearch = isToolActive(memoryStatus, TOOL_IDS.WEB_SEARCH);

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

    return (
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
