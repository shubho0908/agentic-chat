import { Atom } from "lucide-react";
import { ContextItem } from "./contextItem";
import { VisionContextItem } from "./visionContextItem";
import type { MemoryStatusProps } from "./types";

export function ToolOnlyDefaultContext({ memoryStatus }: MemoryStatusProps) {
  return (
    <>
      {memoryStatus.hasImages && (
        <VisionContextItem imageCount={memoryStatus.imageCount} />
      )}
      <ContextItem
        icon={Atom}
        label={
          memoryStatus.activeToolName
            ? `${memoryStatus.activeToolName.replace(/_/g, " ")} tool`
            : "Tool active"
        }
        treeSymbol="└─"
        iconClassName="text-blue-600 dark:text-blue-400"
        labelClassName="text-blue-700 dark:text-blue-300"
      />
    </>
  );
}
