"use client";

import { useState, useRef } from "react";
import { Settings2, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdownMenu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AVAILABLE_TOOLS, type ToolId, type ToolConfig } from "@/lib/tools/config";
import { SUPPORTED_IMAGE_EXTENSIONS, SUPPORTED_DOCUMENT_EXTENSIONS } from "@/constants/upload";
import { useSession } from "@/lib/authClient";
import { useIsMobile } from "@/hooks/useMobile";
import { MemoryToggle } from "./memoryToggle";
import { ThinkingToggle } from "./thinkingToggle";
import { ToolsDrawer } from "./toolsDrawer";
import { ConnectorsSubmenuContent } from "./connectorsSubmenu";

const ACCEPTED_FILE_TYPES = [
  'image/*',
  ...SUPPORTED_IMAGE_EXTENSIONS,
  ...SUPPORTED_DOCUMENT_EXTENSIONS,
].join(',');

interface ToolsMenuProps {
  onToolSelected?: (toolId: ToolId) => void;
  disabled?: boolean;
  activeTool?: ToolId | null;
  memoryEnabled?: boolean;
  onMemoryToggle?: (enabled: boolean) => void;
  thinkingEnabled?: boolean;
  onThinkingToggle?: (enabled: boolean) => void;
  onFilesSelected?: (files: File[]) => void;
  fileCount?: number;
  onAuthRequired?: () => void;
}

export function ToolsMenu({
  onToolSelected,
  disabled,
  activeTool = null,
  memoryEnabled = true,
  onMemoryToggle,
  thinkingEnabled = false,
  onThinkingToggle,
  onFilesSelected,
  fileCount = 0,
  onAuthRequired,
}: ToolsMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { data: session } = useSession();
  const isMobile = useIsMobile();

  const handleToolSelect = (toolId: ToolId) => {
    if (!session) {
      onAuthRequired?.();
      setIsOpen(false);
      return;
    }

    onToolSelected?.(toolId);
    setIsOpen(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      onFilesSelected?.(files);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    setIsOpen(false);
  };

  const hasActiveTool = activeTool !== null;
  const showToolIcon = hasActiveTool;

  const handleButtonClick = (e: React.MouseEvent) => {
    if (disabled) return;
    if (showToolIcon && activeTool) {
      e.preventDefault();
      e.stopPropagation();
      handleToolSelect(activeTool);
    }
  };

  if (showToolIcon) {
    const toolConfig = activeTool ? (AVAILABLE_TOOLS as Record<string, ToolConfig>)[activeTool] : null;
    if (!toolConfig) return null;
    const ActiveToolIcon = toolConfig.icon;

    return (
      <TooltipProvider>
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <Button
              type="button"
              onClick={handleButtonClick}
              disabled={disabled}
              variant="ghost"
              size="icon"
              className="size-8 rounded-full animate-in fade-in-0 zoom-in-95 duration-200 hover:opacity-80 transition-opacity"
              style={{
                background: `linear-gradient(135deg, ${toolConfig.gradientColors.from}33, ${toolConfig.gradientColors.via}53, ${toolConfig.gradientColors.to}33)`,
              }}
              aria-label={`${toolConfig.name} (click to deactivate)`}
              onMouseEnter={(e) => {
                if (!disabled) {
                  e.currentTarget.style.background = `linear-gradient(135deg, ${toolConfig.gradientColors.from}4D, ${toolConfig.gradientColors.via}4D, ${toolConfig.gradientColors.to}4D)`;
                }
              }}
              onMouseLeave={(e) => {
                if (!disabled) {
                  e.currentTarget.style.background = `linear-gradient(135deg, ${toolConfig.gradientColors.from}33, ${toolConfig.gradientColors.via}53, ${toolConfig.gradientColors.to}33)`;
                }
              }}
            >
              <ActiveToolIcon className={`size-4 ${toolConfig.iconColorClass} animate-in spin-in-180 zoom-in-0 duration-300`} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" align="center">
            <p>{toolConfig.name}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileSelect}
        className="hidden"
        accept={ACCEPTED_FILE_TYPES}
        disabled={disabled}
        aria-label="Upload files"
      />

      {isMobile ? (
        <ToolsDrawer
          isOpen={isOpen}
          onOpenChange={setIsOpen}
          disabled={disabled}
          hasActiveTool={hasActiveTool}
          fileCount={fileCount}
          memoryEnabled={memoryEnabled}
          onMemoryToggle={onMemoryToggle}
          thinkingEnabled={thinkingEnabled}
          onThinkingToggle={onThinkingToggle}
          onFilesSelected={onFilesSelected}
          fileInputRef={fileInputRef}
        />
      ) : (
        <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
          <div className="relative">
            <TooltipProvider>
              <Tooltip delayDuration={300}>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      disabled={disabled}
                      variant="ghost"
                      size="icon"
                      className="size-8 rounded-full active:scale-95 transition-transform hover:bg-black/5 dark:hover:bg-white/5"
                      aria-label="Tools"
                    >
                      <Settings2
                        className="size-4 transition-transform duration-200"
                        style={{
                          transform: isOpen ? 'scaleX(-1)' : 'scaleX(1)'
                        }}
                      />
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent side="top" align="center">
                  <p>{hasActiveTool ? 'Deactivate tool' : 'Tools'}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {fileCount > 0 && (
              <Badge
                variant="default"
                className="absolute -top-0.5 -right-0.5 size-4 flex items-center justify-center p-0 text-[9px] rounded-full md:hidden"
              >
                {fileCount}
              </Badge>
            )}
          </div>

          <DropdownMenuContent
            align="start"
            side="top"
            className="w-56 border-muted/50 shadow-xl md:w-64 animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 duration-200"
            sideOffset={8}
          >
            {onFilesSelected && (
              <>
                <div className="md:hidden">
                  <DropdownMenuItem
                    onClick={() => fileInputRef.current?.click()}
                    disabled={disabled}
                    className="cursor-pointer gap-3 py-2.5"
                  >
                    <Paperclip className="size-4 text-muted-foreground" />
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium">Attach Files</span>
                      <span className="text-xs text-muted-foreground">
                        {fileCount > 0 ? `${fileCount} file${fileCount > 1 ? 's' : ''} selected` : 'Images and documents'}
                      </span>
                    </div>
                  </DropdownMenuItem>
                </div>
                <DropdownMenuSeparator className="md:hidden" />
              </>
            )}

            <MemoryToggle enabled={memoryEnabled} onToggle={onMemoryToggle} />

            <ThinkingToggle enabled={thinkingEnabled} onToggle={onThinkingToggle} />

            <DropdownMenuSeparator />

            <div className="max-h-[240px] overflow-y-auto">
              <ConnectorsSubmenuContent onActionComplete={() => setIsOpen(false)} />
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </>
  );
}
