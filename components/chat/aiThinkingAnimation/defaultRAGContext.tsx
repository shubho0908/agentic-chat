import { FileText, Brain } from "lucide-react";
import { ContextItem } from "./contextItem";
import type { MemoryStatusProps } from "./types";

export function DefaultRAGContext({ memoryStatus }: MemoryStatusProps) {
  return (
    <>
      {memoryStatus.hasDocuments && (
        <ContextItem
          icon={FileText}
          label={
            memoryStatus.documentCount > 0
              ? `${memoryStatus.documentCount} attached ${memoryStatus.documentCount === 1 ? "doc" : "docs"}`
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
              ? `${memoryStatus.memoryCount} ${memoryStatus.memoryCount === 1 ? "memory" : "memories"} (past chats)`
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
