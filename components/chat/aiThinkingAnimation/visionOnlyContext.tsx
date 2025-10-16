import { Eye } from "lucide-react";
import { ContextItem } from "./contextItem";
import type { VisionOnlyContextProps } from "./types";

export function VisionOnlyContext({ imageCount }: VisionOnlyContextProps) {
  return (
    <ContextItem
      icon={Eye}
      label={
        imageCount > 0
          ? `${imageCount} ${imageCount === 1 ? "image" : "images"}`
          : "Vision analysis"
      }
      treeSymbol="└─"
      note="(text context skipped)"
      iconClassName="text-cyan-600 dark:text-cyan-400"
      labelClassName="text-cyan-700 dark:text-cyan-300"
    />
  );
}
