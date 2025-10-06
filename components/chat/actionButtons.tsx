import { Send, StopCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ActionButtonsProps {
  isLoading: boolean;
  isUploading: boolean;
  disabled: boolean;
  hasInput: boolean;
  onStop?: () => void;
  size?: "default" | "large";
}

export function ActionButtons({
  isLoading,
  isUploading,
  disabled,
  hasInput,
  onStop,
  size = "default",
}: ActionButtonsProps) {
  const isLarge = size === "large";

  if (isLoading && onStop) {
    return (
      <Button
        type="button"
        onClick={onStop}
        size="icon"
        variant="ghost"
        className={cn(
          "size-10 rounded-xl",
          isLarge && "size-11 rounded-2xl hover:bg-destructive/10"
        )}
      >
        <StopCircle className="size-5 text-destructive" />
        <span className="sr-only">Stop generating</span>
      </Button>
    );
  }

  return (
    <Button
      type="submit"
      disabled={!hasInput || isLoading || disabled || isUploading}
      size="icon"
      className={cn(
        "size-10 rounded-xl",
        isLarge && "size-11 rounded-full"
      )}
    >
      {isUploading ? (
        <Loader2 className={cn("size-4 animate-spin", isLarge && "size-5")} />
      ) : (
        <Send className={cn("size-4", isLarge && "size-5")} />
      )}
      <span className="sr-only">Send message</span>
    </Button>
  );
}
