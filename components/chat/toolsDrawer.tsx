"use client";

import { Paperclip, Settings2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
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
import { AVAILABLE_TOOLS, type ToolId, type ToolConfig } from "@/lib/tools/config";
import type { SearchDepth } from "@/lib/schemas/web-search.tools";
import type { Session } from "@/lib/auth";
import { ToolMenuItemDrawer } from "./toolMenuItemDrawer";
import { MemoryToggle } from "./memoryToggle";

interface ToolsDrawerProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  disabled?: boolean;
  hasActiveTool: boolean;
  fileCount?: number;
  activeTool?: ToolId | null;
  memoryEnabled?: boolean;
  onMemoryToggle?: (enabled: boolean) => void;
  onFilesSelected?: (files: File[]) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  session: Session | null;
  searchDepth?: SearchDepth;
  deepResearchUsage?: {
    remaining: number;
    limit: number;
    loading: boolean;
  };
  googleSuiteStatus?: {
    authorized: boolean;
    loading: boolean;
  };
  onToolSelect: (toolId: ToolId, selectedDepth?: SearchDepth) => void;
}

export function ToolsDrawer({
  isOpen,
  onOpenChange,
  disabled,
  hasActiveTool,
  fileCount = 0,
  activeTool,
  memoryEnabled = true,
  onMemoryToggle,
  onFilesSelected,
  fileInputRef,
  session,
  searchDepth = 'basic',
  deepResearchUsage,
  googleSuiteStatus,
  onToolSelect,
}: ToolsDrawerProps) {
  const triggerButton = (
    <Button
      type="button"
      disabled={disabled}
      variant="ghost"
      className={cn(
        buttonVariants({ variant: "ghost", size: "icon" }),
        "size-10 rounded-lg active:scale-95 transition-transform",
        hasActiveTool
          ? 'bg-primary/10 hover:bg-primary/15'
          : 'hover:bg-accent'
      )}
      aria-label="Tools"
    >
      <Settings2
        className={`size-4 transition-all duration-75 ${hasActiveTool ? 'text-primary' : ''
          }`}
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
                    className="w-full flex items-center gap-3 py-3 px-3 rounded-lg hover:bg-accent transition-colors disabled:opacity-50"
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

            <div className="h-px bg-border my-3" />

            <div className="px-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                Integrated Apps
              </p>
              <div className="space-y-1">
                {Object.values(AVAILABLE_TOOLS)
                  .filter((tool): tool is ToolConfig => tool !== undefined)
                  .map((tool) => (
                    <ToolMenuItemDrawer
                      key={tool.id}
                      tool={tool}
                      isActive={activeTool === tool.id}
                      isAuthenticated={!!session}
                      searchDepth={searchDepth}
                      deepResearchUsage={deepResearchUsage}
                      googleSuiteStatus={googleSuiteStatus}
                      onToolSelect={onToolSelect}
                    />
                  ))}
              </div>
            </div>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
