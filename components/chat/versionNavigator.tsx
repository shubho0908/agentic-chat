import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface VersionNavigatorProps {
  currentVersion: number;
  totalVersions: number;
  historyIndex: number;
  historyLength: number;
  onPrevious: () => void;
  onNext: () => void;
}

export function VersionNavigator({
  currentVersion,
  totalVersions,
  historyIndex,
  historyLength,
  onPrevious,
  onNext,
}: VersionNavigatorProps) {
  if (historyLength === 0) return null;

  return (
    <div className="flex items-center gap-2 py-2">
      <Button
        variant="ghost"
        size="sm"
        onClick={onPrevious}
        disabled={historyIndex >= historyLength - 1}
        className="h-7 px-2"
      >
        <ChevronLeft className="size-4" />
      </Button>
      <span className="text-xs text-muted-foreground font-medium px-2 py-1 bg-muted/50 rounded-md">
        {currentVersion}/{totalVersions}
      </span>
      <Button
        variant="ghost"
        size="sm"
        onClick={onNext}
        disabled={historyIndex === -1}
        className="h-7 px-2"
      >
        <ChevronRight className="size-4" />
      </Button>
    </div>
  );
}
