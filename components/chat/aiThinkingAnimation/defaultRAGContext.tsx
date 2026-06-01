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
        />
      )}

      {memoryStatus.hasMemories && (
        <ContextItem
          icon={Brain}
          label={
            memoryStatus.memoryCount > 0
              ? `${memoryStatus.memoryCount} ${memoryStatus.memoryCount === 1 ? "memory" : "memories"}`
              : "Searching memories"
          }
          detail="past chats"
          completed={memoryStatus.memoryCount > 0}
        />
      )}

      {memoryStatus.attemptedMemory && !memoryStatus.hasMemories && !memoryStatus.skippedMemory && (
        <ContextItem
          icon={Brain}
          label="Memories checked"
          note="no relevant match"
          completed
        />
      )}

      {memoryStatus.skippedMemory && !memoryStatus.hasMemories && (
        <ContextItem
          icon={Brain}
          label="Memories"
          note="skipped"
          skipped
        />
      )}
    </>
  );
}
