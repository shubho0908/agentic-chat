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
      />
      <ContextItem
        icon={FileText}
        label={
          documentCount > 0
            ? `${documentCount} attached ${documentCount === 1 ? "doc" : "docs"}`
            : "Document context"
        }
      />
    </>
  );
}
