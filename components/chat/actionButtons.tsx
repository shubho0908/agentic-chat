import { Send, StopCircle, Loader } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface ActionButtonsProps {
  isLoading: boolean;
  isUploading: boolean;
  isSending: boolean;
  disabled: boolean;
  hasInput: boolean;
  onStop?: () => void;
  size?: "default" | "large";
}

export function ActionButtons({
  isLoading,
  isUploading,
  isSending,
  disabled,
  hasInput,
  onStop,
  size = "default",
}: ActionButtonsProps) {
  const isLarge = size === "large";

  if (isLoading && onStop) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              onClick={onStop}
              size="icon"
              variant="ghost"
              className={cn(
                "size-10 rounded-lg",
                isLarge && "size-11 rounded-xl hover:bg-destructive/10"
              )}
            >
              <StopCircle className="size-5 text-destructive" />
              <span className="sr-only">Stop generating</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Stop generating</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <Button
      type="submit"
      disabled={!hasInput || isLoading || disabled || isUploading || isSending}
      size="icon"
      className={cn(
        "size-10 rounded-lg",
        isLarge && "size-11 rounded-xl"
      )}
    >
      {isUploading || isSending ? (
        <Loader className={cn("size-4 animate-spin", isLarge && "size-5")} />
      ) : (
        <Send className={cn("size-4", isLarge && "size-5")} />
      )}
      <span className="sr-only">Send message</span>
    </Button>
  );
}
