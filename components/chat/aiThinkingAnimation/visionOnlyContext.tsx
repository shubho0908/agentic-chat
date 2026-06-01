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
      note="text context skipped"
    />
  );
}
