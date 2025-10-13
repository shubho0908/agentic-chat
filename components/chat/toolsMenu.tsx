"use client";

import { useState, useRef } from "react";
import { Settings, Brain, Paperclip } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AVAILABLE_TOOLS, type ToolId } from "@/lib/tools/config";
import { SUPPORTED_IMAGE_EXTENSIONS, SUPPORTED_DOCUMENT_EXTENSIONS } from "@/constants/upload";

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
  onFilesSelected?: (files: File[]) => void;
  fileCount?: number;
}

export function ToolsMenu({ 
  onToolSelected,
  disabled,
  activeTool = null,
  memoryEnabled = false,
  onMemoryToggle,
  onFilesSelected,
  fileCount = 0,
}: ToolsMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleToolSelect = (toolId: ToolId) => {
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
    if (showToolIcon && activeTool) {
      e.preventDefault();
      e.stopPropagation();
      handleToolSelect(activeTool);
    }
  };

  if (showToolIcon && activeTool) {
    const activeToolConfig = AVAILABLE_TOOLS[activeTool];
    const ActiveToolIcon = activeToolConfig.icon;
    
    return (
      <TooltipProvider>
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              <Button
                type="button"
                size="icon"
                variant="ghost"
                disabled={disabled}
                onClick={handleButtonClick}
                className="size-10 rounded-lg transition-all"
                style={{
                  background: `linear-gradient(135deg, ${activeToolConfig.gradientColors.from}33, ${activeToolConfig.gradientColors.via}33, ${activeToolConfig.gradientColors.to}33)`,
                }}
                aria-label={`${activeToolConfig.name} (click to deactivate)`}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = `linear-gradient(135deg, ${activeToolConfig.gradientColors.from}4D, ${activeToolConfig.gradientColors.via}4D, ${activeToolConfig.gradientColors.to}4D)`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = `linear-gradient(135deg, ${activeToolConfig.gradientColors.from}33, ${activeToolConfig.gradientColors.via}33, ${activeToolConfig.gradientColors.to}33)`;
                }}
              >
                <motion.div
                  initial={{ rotate: -180, scale: 0 }}
                  animate={{ rotate: 0, scale: 1 }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                >
                  <ActiveToolIcon className={`size-4 ${activeToolConfig.iconColorClass}`} />
                </motion.div>
              </Button>
            </motion.div>
          </TooltipTrigger>
          <TooltipContent side="top" align="center">
            <p>{activeToolConfig.name}</p>
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
      />

      <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
        <TooltipProvider>
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <div className="relative">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    disabled={disabled}
                    className={`size-10 rounded-lg transition-all ${
                      hasActiveTool 
                        ? 'bg-primary/10 hover:bg-primary/15' 
                        : 'hover:bg-accent'
                    }`}
                    aria-label="Tools"
                  >
                    <motion.div
                      animate={{ rotate: isOpen ? 45 : 0 }}
                      transition={{ duration: 0.3, ease: "easeInOut" }}
                    >
                      <Settings className={`size-4 ${hasActiveTool ? 'text-primary' : ''}`} />
                    </motion.div>
                  </Button>
                  {fileCount > 0 && (
                    <Badge 
                      variant="default"
                      className="absolute -top-0.5 -right-0.5 size-4 flex items-center justify-center p-0 text-[9px] rounded-full md:hidden"
                    >
                      {fileCount}
                    </Badge>
                  )}
                </div>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="top" align="center">
              <p>{hasActiveTool ? 'Deactivate tool' : 'Tools'}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <DropdownMenuContent 
          align="start"
          side="top"
          className="w-56 border-muted/50 shadow-xl md:w-64"
          sideOffset={8}
          asChild
        >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
        >
          <div>
            {onFilesSelected && (
              <>
                <div className="md:hidden">
                  <DropdownMenuLabel className="text-xs font-medium text-muted-foreground px-2 py-1.5">
                    Attachments
                  </DropdownMenuLabel>
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

            <DropdownMenuLabel className="text-xs font-medium text-muted-foreground px-2 py-1.5">
              Memory Settings
            </DropdownMenuLabel>
            <div className="px-2 py-2">
              <div className="flex items-center justify-between space-x-3">
                <div className="flex items-center gap-2">
                  <Brain className={`size-4 ${memoryEnabled ? 'text-primary' : 'text-muted-foreground'}`} />
                  <Label 
                    htmlFor="memory-toggle" 
                    className="text-sm font-medium cursor-pointer"
                  >
                    Memory
                  </Label>
                </div>
                <Switch 
                  id="memory-toggle"
                  checked={memoryEnabled}
                  onCheckedChange={onMemoryToggle}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {memoryEnabled 
                  ? "AI will remember context from past conversations" 
                  : "AI will not access conversation history"}
              </p>
            </div>
            
            <DropdownMenuSeparator />
            
            <DropdownMenuLabel className="text-xs font-medium text-muted-foreground px-2 py-1.5">
              Available Tools
            </DropdownMenuLabel>

            {Object.values(AVAILABLE_TOOLS).map((tool) => {
              const ToolIcon = tool.icon;
              const isActive = activeTool === tool.id;
              
              return (
                <div key={tool.id}>
                  <DropdownMenuItem
                    onClick={() => handleToolSelect(tool.id)}
                    className={`cursor-pointer gap-3 py-2.5 ${
                      isActive ? 'bg-primary/10' : ''
                    }`}
                  >
                    <motion.div
                      whileHover={{ scale: 1.1 }}
                      transition={{ duration: 0.2 }}
                    >
                      <ToolIcon 
                        className={`size-4 transition-colors ${
                          isActive ? tool.iconColorClass : 'text-muted-foreground'
                        }`} 
                      />
                    </motion.div>
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium">{tool.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {tool.description}
                      </span>
                    </div>
                    {isActive && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="ml-auto size-2 rounded-full bg-primary"
                      />
                    )}
                  </DropdownMenuItem>
                </div>
              );
            })}
          </div>
        </motion.div>
      </DropdownMenuContent>
    </DropdownMenu>
    </>
  );
}
