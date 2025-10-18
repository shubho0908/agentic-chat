"use client";

import { useState, useRef } from "react";
import { Settings2, Brain, Paperclip, Info, Atom } from "lucide-react";
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
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AVAILABLE_TOOLS, TOOL_IDS, type ToolId } from "@/lib/tools/config";
import { SUPPORTED_IMAGE_EXTENSIONS, SUPPORTED_DOCUMENT_EXTENSIONS } from "@/constants/upload";
import { useDeepResearchUsage } from "@/hooks/useDeepResearchUsage";
import { useGoogleSuiteAuth } from "@/hooks/useGoogleSuiteAuth";
import { useSession } from "@/lib/auth-client";
import { GOOGLE_SUITE_SERVICES } from "@/components/icons/google-suite-icons";

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
  onAuthRequired?: () => void;
}

export function ToolsMenu({
  onToolSelected,
  disabled,
  activeTool = null,
  memoryEnabled = false,
  onMemoryToggle,
  onFilesSelected,
  fileCount = 0,
  onAuthRequired,
}: ToolsMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const { data: session } = useSession();
  const { data: usageData, isLoading: usageLoading } = useDeepResearchUsage();
  const { status: googleSuiteStatus, isLoading: googleSuiteLoading, authorize: authorizeGoogleSuite } = useGoogleSuiteAuth();
  
  const deepResearchUsage = {
    remaining: usageData?.remaining ?? 3,
    limit: usageData?.limit ?? 3,
    loading: usageLoading,
  };

  const handleToolSelect = (toolId: ToolId) => {
    if (!session) {
      onAuthRequired?.();
      setIsOpen(false);
      return;
    }
    
    if (toolId === TOOL_IDS.GOOGLE_SUITE && !googleSuiteStatus?.authorized) {
      authorizeGoogleSuite();
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
    const toolConfig = activeTool ? AVAILABLE_TOOLS[activeTool] : null;
    
    if (!toolConfig) return null;
    const ActiveToolIcon = toolConfig.icon;

    return (
      <TooltipProvider>
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <div
              onClick={handleButtonClick}
              className={cn(
                buttonVariants({ variant: "ghost", size: "icon" }),
                "size-10 rounded-lg animate-in fade-in-0 zoom-in-95 duration-200 cursor-pointer",
                disabled ? "pointer-events-none opacity-50" : ""
              )}
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
            </div>
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

              <div className="px-2 py-2 space-y-3">
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
                <p className="text-xs text-muted-foreground">
                  {memoryEnabled
                    ? "AI will remember context from past conversations"
                    : "AI will not access conversation history"}
                </p>
              </div>

              <DropdownMenuSeparator />

              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="gap-3 py-2.5 cursor-pointer group">
                  <div className="relative flex items-center justify-center size-8 rounded-md bg-gradient-to-br from-purple-500/10 via-blue-500/10 to-cyan-500/10 group-hover:from-purple-500/20 group-hover:via-blue-500/20 group-hover:to-cyan-500/20 transition-colors">
                    <Atom className="size-4 text-purple-400 dark:text-purple-300" />
                  </div>
                  <div className="flex flex-col gap-0.5 flex-1">
                    <span className="font-medium">AI Tools</span>
                    <span className="text-xs text-muted-foreground">
                      {activeTool ? `${AVAILABLE_TOOLS[activeTool as ToolId]?.name || ''} active` : 'Enhance AI capabilities'}
                    </span>
                  </div>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent sideOffset={8} className="w-72 p-2 space-y-1">
                  <div className="px-2 py-1.5 mb-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Available Tools
                    </p>
                  </div>
                  {Object.values(AVAILABLE_TOOLS).map((tool) => {
                    const ToolIcon = tool.icon;
                    const isActive = activeTool === tool.id;
                    const isDeepResearch = tool.id === TOOL_IDS.DEEP_RESEARCH;
                    const isGoogleSuite = tool.id === TOOL_IDS.GOOGLE_SUITE;
                    const isNotAuthenticated = !session;
                    const isDisabled = isNotAuthenticated || (isDeepResearch && !deepResearchUsage.loading && deepResearchUsage.remaining === 0);
                    const needsAuth = isGoogleSuite && !googleSuiteLoading && !googleSuiteStatus?.authorized;

                    return (
                      <div key={tool.id}>
                        <DropdownMenuItem
                          onClick={() => !isDisabled && handleToolSelect(tool.id)}
                          disabled={isDisabled}
                          className={cn(
                            "gap-3 py-3 rounded-lg cursor-pointer group transition-all",
                            isDisabled && "opacity-50 cursor-not-allowed",
                            isActive && "bg-gradient-to-r from-primary/10 to-primary/5 border-l-2 border-primary"
                          )}
                        >
                          <div 
                            className="relative flex items-center justify-center size-9 rounded-lg transition-all group-hover:scale-110"
                            style={{
                              background: `linear-gradient(135deg, ${tool.gradientColors.from}20, ${tool.gradientColors.via}30, ${tool.gradientColors.to}20)`,
                            }}
                          >
                            <ToolIcon
                              className={cn(
                                "size-4 transition-colors",
                                isActive ? tool.iconColorClass : 'text-muted-foreground group-hover:text-foreground'
                              )}
                            />
                          </div>
                          <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-medium truncate">{tool.name}</span>
                              {!isNotAuthenticated && needsAuth && (
                                <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-4 shrink-0">
                                  Auth Required
                                </Badge>
                              )}
                              {isDeepResearch && (
                                <TooltipProvider>
                                  <Tooltip delayDuration={200}>
                                    <TooltipTrigger asChild>
                                      <Info 
                                        className="size-3.5 text-muted-foreground hover:text-foreground transition-colors cursor-help shrink-0" 
                                        onClick={(e) => e.stopPropagation()}
                                      />
                                    </TooltipTrigger>
                                    <TooltipContent side="right" className="max-w-xs">
                                      <div className="space-y-1">
                                        <p className="font-medium">
                                          {deepResearchUsage.loading ? (
                                            "Loading usage..."
                                          ) : deepResearchUsage.remaining === 0 ? (
                                            "Limit Reached"
                                          ) : (
                                            "Usage Information"
                                          )}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                          {isNotAuthenticated ? (
                                            "Please login to use this tool. Deep Research performs comprehensive research across multiple sources to provide in-depth analysis."
                                          ) : deepResearchUsage.loading ? (
                                            "Please wait..."
                                          ) : deepResearchUsage.remaining === 0 ? (
                                            `You've used all ${deepResearchUsage.limit} deep research queries this month. Resets next month.`
                                          ) : (
                                            `${deepResearchUsage.remaining} of ${deepResearchUsage.limit} deep research queries remaining this month.`
                                          )}
                                        </p>
                                      </div>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                              {isGoogleSuite && (
                                <TooltipProvider>
                                  <Tooltip delayDuration={200}>
                                    <TooltipTrigger asChild>
                                      <Info 
                                        className="size-3.5 text-muted-foreground hover:text-foreground transition-colors cursor-help shrink-0" 
                                        onClick={(e) => e.stopPropagation()}
                                      />
                                    </TooltipTrigger>
                                    <TooltipContent side="right" className="max-w-xs p-3">
                                      <div className="space-y-2">
                                        <p className="font-medium text-sm">Available Services</p>
                                        <div className="grid grid-cols-3 gap-2">
                                          {GOOGLE_SUITE_SERVICES.map((service) => {
                                            const ServiceIcon = service.icon;
                                            return (
                                              <div
                                                key={service.name}
                                                className="flex flex-col items-center gap-1.5 p-2 rounded-lg hover:bg-accent/20 transition-colors cursor-pointer"
                                              >
                                                <div className="size-8 flex items-center justify-center">
                                                  <ServiceIcon className="size-7" />
                                                </div>
                                                <span className="text-[10px] font-medium text-center">
                                                  {service.name}
                                                </span>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                            </div>
                            <span className="text-xs text-muted-foreground truncate">
                              {isNotAuthenticated ? 'Login required to access this tool' : isGoogleSuite && needsAuth ? 'Click to authorize Gmail access' : tool.description}
                            </span>
                          </div>
                          {isActive && (
                            <motion.div
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              className="ml-auto size-2 rounded-full bg-primary shadow-lg shadow-primary/50"
                            />
                          )}
                        </DropdownMenuItem>
                      </div>
                    );
                  })}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </div>
          </motion.div>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
