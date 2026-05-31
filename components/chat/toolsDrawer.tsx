"use client";

import { Paperclip, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/lib/buttonVariants";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { MemoryToggle } from "./memoryToggle";
import { ThinkingToggle } from "./thinkingToggle";
import { ConnectorsDrawerContent } from "./connectorsDrawerContent";

interface ToolsDrawerProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  disabled?: boolean;
  hasActiveTool: boolean;
  fileCount?: number;
  memoryEnabled?: boolean;
  onMemoryToggle?: (enabled: boolean) => void;
  thinkingEnabled?: boolean;
  onThinkingToggle?: (enabled: boolean) => void;
  onFilesSelected?: (files: File[]) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
}

export function ToolsDrawer({
  isOpen,
  onOpenChange,
  disabled,
  hasActiveTool,
  fileCount = 0,
  memoryEnabled = true,
  onMemoryToggle,
  thinkingEnabled = false,
  onThinkingToggle,
  onFilesSelected,
  fileInputRef,
}: ToolsDrawerProps) {
  const triggerButton = (
    <Button
      type="button"
      disabled={disabled}
      variant="ghost"
      className={cn(
        buttonVariants({ variant: "ghost", size: "icon" }),
        "size-10 rounded-lg active:scale-95 transition-transform p-1",
        hasActiveTool
          ? 'bg-primary/10 hover:bg-primary/15'
          : 'hover:bg-accent'
      )}
      aria-label="Tools"
    >
      <Settings2
        className={`size-4 transition-all duration-75 ${hasActiveTool ? 'text-primary' : ''}`}
        style={{
          transform: isOpen ? 'scaleX(-1)' : 'scaleX(1)'
        }}
      />
    </Button>
  );

  return (
    <Drawer open={isOpen} onOpenChange={onOpenChange}>
      <div className="relative">
        <TooltipProvider>
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <DrawerTrigger asChild>
                {triggerButton}
              </DrawerTrigger>
            </TooltipTrigger>
            <TooltipContent side="top" align="center">
              <p>{hasActiveTool ? 'Deactivate tool' : 'Tools'}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        {fileCount > 0 && (
          <Badge
            variant="default"
            className="absolute -top-0.5 -right-0.5 size-4 flex items-center justify-center p-0 text-[9px] rounded-full"
          >
            {fileCount}
          </Badge>
        )}
      </div>

      <DrawerContent className="max-h-[80vh]">
        <DrawerHeader>
          <DrawerTitle>Tools & Settings</DrawerTitle>
        </DrawerHeader>
        <div className="overflow-y-auto px-4 pb-6">
          <div className="space-y-2">
            {onFilesSelected && (
              <>
                <div className="px-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                    Attachments
                  </p>
                  <button
                    onClick={() => {
                      fileInputRef.current?.click();
                      onOpenChange(false);
                    }}
                    disabled={disabled}
                    type="button"
                    className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-accent transition-colors disabled:opacity-50"
                  >
                    <Paperclip className="size-4 text-muted-foreground" />
                    <div className="flex flex-col gap-0.5 text-left">
                      <span className="font-medium text-sm">Attach Files</span>
                      <span className="text-xs text-muted-foreground">
                        {fileCount > 0 ? `${fileCount} file${fileCount > 1 ? 's' : ''} selected` : 'Images and documents'}
                      </span>
                    </div>
                  </button>
                </div>
                <div className="h-px bg-border my-3" />
              </>
            )}

            <div className="px-2">
              <MemoryToggle enabled={memoryEnabled} onToggle={onMemoryToggle} />
            </div>

            <div className="px-2 mt-2">
              <ThinkingToggle enabled={thinkingEnabled} onToggle={onThinkingToggle} />
            </div>

            <div className="h-px bg-border my-3" />

            <div className="px-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                Integrated Apps
              </p>
              <div className="max-h-72 overflow-y-auto rounded-lg -mx-0.5 px-0.5">
                <ConnectorsDrawerContent />
              </div>
            </div>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
