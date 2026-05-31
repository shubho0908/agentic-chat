"use client";

import { ArrowUp, Loader, StopCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type ActionStatus = "idle" | "loading" | "uploading" | "sending";

interface ActionButtonsProps {
  status: ActionStatus;
  disabled: boolean;
  hasInput: boolean;
  onStop?: () => void;
  size?: "default" | "large";
}

export function ActionButtons({
  status,
  disabled,
  hasInput,
  onStop,
  size = "default",
}: ActionButtonsProps) {
  const isLarge = size === "large";
  const isBusy = status !== "idle";

  if (status === "loading" && onStop) {
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
      disabled={!hasInput || isBusy || disabled}
      size="icon"
      className={cn(
        "size-8 rounded-full transition-all duration-300 ease-out",
        isLarge ? "size-10" : "",
        hasInput 
          ? "bg-primary text-primary-foreground shadow-sm hover:scale-105 hover:bg-primary/90" 
          : "bg-black/5 dark:bg-white/5 text-muted-foreground shadow-none"
      )}
    >
      {status === "uploading" || status === "sending" ? (
        <Loader className={cn("size-4 animate-spin", isLarge && "size-5")} />
      ) : (
        <ArrowUp className={cn("size-4", isLarge && "size-5")} />
      )}
      <span className="sr-only">Send message</span>
    </Button>
  );
}
