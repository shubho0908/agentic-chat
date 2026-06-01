import { Eye } from "lucide-react";
import { ContextItem } from "./contextItem";
import type { VisionContextItemProps } from "./types";

export function VisionContextItem({ imageCount }: VisionContextItemProps) {
  return (
    <ContextItem
      icon={Eye}
      label={
        imageCount > 0
          ? `${imageCount} ${imageCount === 1 ? "image" : "images"}`
          : "Vision analysis"
      }
    />
  );
}
