import { Eye, FileText } from "lucide-react";
import { ContextItem } from "./contextItem";
import type { HybridContextProps } from "./types";

export function HybridContext({ imageCount, documentCount }: HybridContextProps) {
  return (
    <>
      <ContextItem
        icon={Eye}
        label={
          imageCount > 0
            ? `${imageCount} ${imageCount === 1 ? "image" : "images"}`
            : "Vision analysis"
        }
        treeSymbol="├─"
        iconClassName="text-cyan-600 dark:text-cyan-400"
        labelClassName="text-cyan-700 dark:text-cyan-300"
      />
      <ContextItem
        icon={FileText}
        label={
          documentCount > 0
            ? `${documentCount} attached ${documentCount === 1 ? "doc" : "docs"}`
            : "Document context"
        }
        treeSymbol="└─"
        iconClassName="text-amber-600 dark:text-amber-400"
        labelClassName="text-amber-700 dark:text-amber-300"
      />
    </>
  );
}
