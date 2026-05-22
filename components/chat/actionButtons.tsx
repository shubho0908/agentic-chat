import { STRING_ENUM } from "@/constants/stringEnums";
import { ArrowUp, StopCircle, Loader } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type ActionButtonState = "idle" | "generating" | "processing" | "disabled";

interface ActionButtonsProps {
  state: ActionButtonState;
  hasInput: boolean;
  onStop?: () => void;
  size?: "default" | "large";
}

export function ActionButtons({
  state,
  hasInput,
  onStop,
  size = "default",
}: ActionButtonsProps) {
  const isLarge = size === STRING_ENUM.LARGE;
  const isGenerating = state === "generating";
  const isProcessing = state === "processing";
  const isDisabled = state === "disabled" || !hasInput;

  if (isGenerating && onStop) {
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
                "size-8 rounded-full transition-all duration-300 ease-out",
                isLarge ? "size-10 hover:bg-destructive/10" : "hover:bg-destructive/10"
              )}
            >
              <StopCircle className="size-4 text-destructive" />
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
      disabled={isDisabled || isGenerating || isProcessing}
      size="icon"
      className={cn(
        "size-8 rounded-full transition-all duration-300 ease-out",
        isLarge ? "size-10" : "",
        hasInput 
          ? "bg-primary text-primary-foreground shadow-sm hover:scale-105 hover:bg-primary/90" 
          : "bg-black/5 dark:bg-white/5 text-muted-foreground shadow-none"
      )}
    >
      {isProcessing ? (
        <Loader className={cn("size-4 animate-spin", isLarge && "size-5")} />
      ) : (
        <ArrowUp className={cn("size-4", isLarge && "size-5")} />
      )}
      <span className="sr-only">Send message</span>
    </Button>
  );
}
