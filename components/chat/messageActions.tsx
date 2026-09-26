import { useEffect, useRef, useState } from "react";
import { Copy, Check, Edit2, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface MessageContext {
  isUser: boolean;
  isEditing: boolean;
  canEdit: boolean;
  isThinking?: boolean;
  isLoading?: boolean;
}

interface MessageActionsProps {
  context: MessageContext;
  textContent: string;
  onEditStart: () => void;
  onEditSubmit?: () => void;
  onEditCancel?: () => void;
  canSaveEdit?: boolean;
  onRegenerate?: () => void;
}

export function MessageActions({
  context,
  textContent,
  onEditStart,
  onEditSubmit,
  onEditCancel,
  canSaveEdit = false,
  onRegenerate,
}: MessageActionsProps) {
  const { isUser, isEditing, canEdit, isThinking = false, isLoading = false } = context;
  const [copied, setCopied] = useState(false);
  const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const regenerateStartedAtRef = useRef<number | null>(null);

  useEffect(() => () => clearTimeout(copiedTimeoutRef.current), []);

  const handleCopy = async () => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(textContent);
      } else if (typeof document !== "undefined") {
        const textarea = document.createElement("textarea");
        textarea.value = textContent;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "absolute";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        try {
          textarea.select();
          document.execCommand("copy");
        } finally {
          textarea.remove();
        }
      } else {
        throw new Error("Clipboard not available");
      }
      setCopied(true);
      toast.success("Copied to clipboard");
      clearTimeout(copiedTimeoutRef.current);
      copiedTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  const handleRegenerate = () => {
    if (!onRegenerate || isLoading) return;

    const now = Date.now();
    if (regenerateStartedAtRef.current !== null && now - regenerateStartedAtRef.current < 2000) return;
    regenerateStartedAtRef.current = now;
    onRegenerate();
  };

  if (isEditing) {
    return (
      <TooltipProvider delayDuration={300}>
        <div className="flex items-center gap-2 opacity-100">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="Save and resend message"
                onClick={onEditSubmit}
                disabled={!canSaveEdit || !onEditSubmit}
                className="size-11 touch-manipulation p-0 text-green-600 hover:bg-green-50 hover:text-green-700 focus-visible:ring-2 focus-visible:ring-foreground/20 dark:text-green-500 dark:hover:bg-green-950/30 dark:hover:text-green-400 sm:size-9"
              >
                <Check className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              Save &amp; Resend
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="Cancel editing message"
                onClick={onEditCancel}
                className="size-11 touch-manipulation p-0 focus-visible:ring-2 focus-visible:ring-foreground/20 sm:size-9"
              >
                <X className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              Cancel
            </TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex items-center gap-1 opacity-100 transition-[opacity,transform] duration-300 ease-out translate-y-1 md:opacity-0 md:group-hover:opacity-100 md:group-hover:translate-y-0">
        {isUser && canEdit && !isEditing && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="Edit message"
                onClick={onEditStart}
                className="h-11 rounded-md px-2 focus-visible:ring-2 focus-visible:ring-foreground/20 sm:h-7"
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
                type="button"
                variant="ghost"
                size="sm"
                aria-label="Regenerate response"
                onClick={handleRegenerate}
                className="h-11 rounded-md px-2 focus-visible:ring-2 focus-visible:ring-foreground/20 sm:h-7"
                disabled={isLoading}
              >
                <RefreshCw className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              Regenerate response
            </TooltipContent>
          </Tooltip>
        )}
        {!isThinking && textContent && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={copied ? "Copied message" : "Copy to clipboard"}
                onClick={handleCopy}
                className="h-11 rounded-md px-2 focus-visible:ring-2 focus-visible:ring-foreground/20 sm:h-7"
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
