"use client";

import { useState, useRef } from "react";
import { Settings2, Brain, Paperclip } from "lucide-react";
import { motion } from "framer-motion";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
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
import { SUPPORTED_IMAGE_EXTENSIONS, SUPPORTED_DOCUMENT_EXTENSIONS } from "@/constants/upload";

const ACCEPTED_FILE_TYPES = [
  'image/*',
  ...SUPPORTED_IMAGE_EXTENSIONS,
  ...SUPPORTED_DOCUMENT_EXTENSIONS,
].join(',');

interface ToolsMenuProps {
  disabled?: boolean;
  memoryEnabled?: boolean;
  onMemoryToggle?: (enabled: boolean) => void;
  onFilesSelected?: (files: File[]) => void;
  fileCount?: number;
}

export function ToolsMenu({
  disabled,
  memoryEnabled = false,
  onMemoryToggle,
  onFilesSelected,
  fileCount = 0,
}: ToolsMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        <div className="relative">
          <TooltipProvider>
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    disabled={disabled}
                    variant="ghost"
                    className={cn(
                      buttonVariants({ variant: "ghost", size: "icon" }),
                      "size-10 rounded-lg active:scale-95 transition-transform hover:bg-accent"
                    )}
                    aria-label="Tools"
                  >
                    <Settings2
                      className="size-4 transition-all duration-75"
                      style={{
                        transform: isOpen ? 'scaleX(-1)' : 'scaleX(1)'
                      }}
                    />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent side="top" align="center">
                <p>Settings</p>
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
                Tools
              </DropdownMenuLabel>
              
              <div className="px-2 py-2 space-y-3">
                <div>
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
              </div>

            </div>
          </motion.div>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
