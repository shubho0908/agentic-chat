import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface MessageEditFormProps {
  editText: string;
  onEditTextChange: (text: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

export function MessageEditForm({
  editText,
  onEditTextChange,
  onSubmit,
  onCancel,
}: MessageEditFormProps) {
  return (
    <div className="space-y-2.5 mt-3 animate-in fade-in duration-200">
      <div className="relative">
        <Textarea
          value={editText}
          onChange={(e) => onEditTextChange(e.target.value)}
          className="min-h-[100px] resize-none rounded-lg border-[1.5px] border-border/80 dark:border-border/70 focus-visible:border-primary transition-all bg-background shadow-sm outline-none focus:outline-none focus-visible:ring-0"
          autoFocus
        />
      </div>
      <div className="flex items-center gap-1.5 animate-in fade-in slide-in-from-bottom-2 duration-150 delay-75">
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="sm"
                onClick={onSubmit}
                disabled={!editText.trim()}
                variant="ghost"
                className="h-8 w-8 p-0 text-green-600 hover:text-green-700 hover:bg-green-50 dark:text-green-500 dark:hover:text-green-400 dark:hover:bg-green-950/30"
              >
                <Check className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              Save & Resend
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={onCancel}
                className="h-8 w-8 p-0"
              >
                <X className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              Cancel
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
}
