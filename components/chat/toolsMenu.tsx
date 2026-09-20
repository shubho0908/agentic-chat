"use client";

import { useState, useRef } from "react";
import { Plus, Paperclip, Search } from "lucide-react";
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
import { SUPPORTED_IMAGE_EXTENSIONS, SUPPORTED_DOCUMENT_EXTENSIONS } from "@/constants/upload";
import { useIsMobile } from "@/hooks/useMobile";
import { ToolsDrawer } from "./toolsDrawer";
import { ConnectorsSubmenuContent } from "./connectorsSubmenu";

const ACCEPTED_FILE_TYPES = [
  'image/*',
  ...SUPPORTED_IMAGE_EXTENSIONS,
  ...SUPPORTED_DOCUMENT_EXTENSIONS,
].join(',');

interface ToolsMenuProps {
  disabled?: boolean;
  onFilesSelected?: (files: File[]) => void;
  fileCount?: number;
}

export function ToolsMenu({
  disabled,
  onFilesSelected,
  fileCount = 0,
}: ToolsMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isMobile = useIsMobile();

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      onFilesSelected?.(files);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    setSearch("");
    setIsOpen(false);
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) setSearch("");
    setIsOpen(open);
  };

  const query = search.trim().toLowerCase();
  const showAttach =
    !query ||
    "add photos & files".includes(query) ||
    "upload from your computer".includes(query);
  const showMemory = !query || "memory".includes(query);

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
          onOpenChange={handleOpenChange}
          disabled={disabled}
          fileCount={fileCount}
          onFilesSelected={onFilesSelected}
          fileInputRef={fileInputRef}
        />
      ) : (
        <DropdownMenu open={isOpen} onOpenChange={handleOpenChange}>
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
                      className="size-9 rounded-full active:scale-95 transition-transform hover:bg-black/5 dark:hover:bg-white/5"
                      aria-label="Add files, tools and connectors"
                    >
                      <Plus
                        className="size-4.5 transition-transform duration-200"
                        style={{
                          transform: isOpen ? 'rotate(45deg)' : 'rotate(0deg)'
                        }}
                      />
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent side="top" align="center">
                  <p>Files, tools & connectors</p>
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
            className="w-[min(320px,calc(100vw-2rem))] rounded-2xl border-border/40 bg-background/95 shadow-xl backdrop-blur-xl animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 duration-200 p-1.5"
            sideOffset={8}
            collisionPadding={12}
          >
            {showAttach && onFilesSelected && (
              <DropdownMenuItem
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled}
                className="cursor-pointer gap-3 rounded-xl p-2.5"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/40 bg-background">
                  <Paperclip className="size-4 text-muted-foreground" />
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[13px] font-medium">Add photos & files</span>
                  <span className="text-[11px] text-muted-foreground">
                    {fileCount > 0
                      ? `${fileCount} file${fileCount > 1 ? 's' : ''} selected`
                      : 'Upload from your computer'}
                  </span>
                </div>
              </DropdownMenuItem>
            )}

            {showMemory && (
              <div className="px-0.5">
              </div>
            )}

            <DropdownMenuSeparator className="my-1.5" />

            <div className="max-h-[260px] overflow-y-auto px-0.5">
              <ConnectorsSubmenuContent
                filter={query}
                onActionComplete={() => handleOpenChange(false)}
              />
            </div>

            <div className="mt-1.5 flex items-center gap-2 border-t border-border/40 px-2.5 pt-2.5 pb-1">
              <Search className="size-3.5 shrink-0 text-muted-foreground/60" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
                placeholder="Type to search sources & files"
                className="w-full bg-transparent text-[13px] outline-none placeholder:text-muted-foreground/50"
              />
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </>
  );
}
