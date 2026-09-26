import { FileText, Brain } from "lucide-react";
import { DegradedContextSource } from "@/types/chat";
import { ContextItem } from "./contextItem";
import type { MemoryStatusProps } from "./types";

export function DefaultRAGContext({ memoryStatus }: MemoryStatusProps) {
  const memoryUnavailable =
    memoryStatus.degradedContexts?.some(
      (degraded) => degraded.source === DegradedContextSource.Memory,
    ) ?? false;
  return (
    <>
      {memoryStatus.hasDocuments && (
        <ContextItem
          icon={FileText}
          label={
            memoryStatus.documentCount === 0 && memoryStatus.documentContextState === "unavailable"
              ? "Attachment context unavailable"
              : memoryStatus.documentCount > 0
              ? `${memoryStatus.documentCount} attached ${memoryStatus.documentCount === 1 ? "doc" : "docs"}`
              : "Searching documents"
          }
          note={memoryStatus.documentCount === 0 && memoryStatus.documentContextState === "unavailable" ? "clarification needed" : undefined}
          unavailable={memoryStatus.documentCount === 0 && memoryStatus.documentContextState === "unavailable"}
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

      {memoryStatus.attemptedMemory && !memoryStatus.hasMemories && !memoryStatus.skippedMemory && !memoryUnavailable && (
        <ContextItem
          icon={Brain}
          label="Memories checked"
          note="no relevant match"
          completed
        />
      )}

      {memoryUnavailable && (
        <ContextItem
          icon={Brain}
          label="Memories"
          note="unavailable"
          skipped
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
