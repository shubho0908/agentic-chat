import { Eye } from "lucide-react";
import { ContextItem } from "./contextItem";
import type { VisionContextItemProps } from "./types";

export function VisionContextItem({ imageCount, treeSymbol = "├─" }: VisionContextItemProps) {
  return (
    <ContextItem
      icon={Eye}
      label={
        imageCount > 0
          ? `${imageCount} ${imageCount === 1 ? "image" : "images"}`
          : "Vision analysis"
      }
      treeSymbol={treeSymbol}
      iconClassName="text-cyan-600 dark:text-cyan-400"
      labelClassName="text-cyan-700 dark:text-cyan-300"
    />
  );
}
