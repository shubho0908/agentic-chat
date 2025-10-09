import { useState, useCallback } from "react";
import { useThrottle } from "@/hooks/useDebounce";
import { Copy, Check, Edit2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface MessageActionsProps {
  isUser: boolean;
  isEditing: boolean;
  textContent: string;
  onEditStart: () => void;
  canEdit: boolean;
  onRegenerate?: () => void;
  isThinking?: boolean;
  isLoading?: boolean;
}

export function MessageActions({
  isUser,
  isEditing,
  textContent,
  onEditStart,
  canEdit,
  onRegenerate,
  isThinking = false,
  isLoading = false,
}: MessageActionsProps) {
  const [copied, setCopied] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(textContent);
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  const throttledRegenerate = useThrottle(
    useCallback(() => {
      if (onRegenerate && !isRegenerating) {
        setIsRegenerating(true);
        onRegenerate();
        setTimeout(() => setIsRegenerating(false), 2000);
      }
    }, [onRegenerate, isRegenerating]),
    2000
  );

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
        {isUser && canEdit && !isEditing && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={onEditStart}
                className="h-7 px-2 rounded-md"
                disabled={isLoading}
              >
                <Edit2 className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              {isLoading ? "Please wait..." : "Edit message"}
            </TooltipContent>
          </Tooltip>
        )}
        {!isUser && onRegenerate && textContent && !isThinking && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={throttledRegenerate}
                className="h-7 px-2 rounded-md"
                disabled={isRegenerating || isLoading}
              >
                <RefreshCw className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              {isRegenerating ? "Regenerating..." : "Regenerate response"}
            </TooltipContent>
          </Tooltip>
        )}
        {!isThinking && textContent && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopy}
                className="h-7 px-2 rounded-md"
                disabled={!textContent}
              >
                {copied ? (
                  <Check className="size-3.5 text-green-500" />
                ) : (
                  <Copy className="size-3.5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              {copied ? "Copied!" : "Copy to clipboard"}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
}
