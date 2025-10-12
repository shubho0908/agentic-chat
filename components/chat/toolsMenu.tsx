"use client";

import { useState } from "react";
import { Wrench, Globe } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AVAILABLE_TOOLS, type ToolId } from "@/lib/tools/config";

interface ToolsMenuProps {
  onToolSelected?: (toolId: ToolId) => void;
  disabled?: boolean;
  activeTool?: ToolId | null;
}

export function ToolsMenu({ 
  onToolSelected,
  disabled,
  activeTool = null,
}: ToolsMenuProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleToolSelect = (toolId: ToolId) => {
    onToolSelected?.(toolId);
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
                className="size-10 rounded-lg transition-all bg-gradient-to-br from-blue-500/20 via-blue-600/20 to-indigo-600/20 hover:from-blue-500/30 hover:via-blue-600/30 hover:to-indigo-600/30"
                aria-label={`${activeToolConfig.name} (click to deactivate)`}
              >
                <motion.div
                  initial={{ rotate: -180, scale: 0 }}
                  animate={{ rotate: 0, scale: 1 }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                >
                  <Globe className="size-4 text-blue-500" />
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
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <TooltipProvider>
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
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
                  className={`size-10 rounded-lg transition-all ${
                    hasActiveTool 
                      ? 'bg-primary/10 hover:bg-primary/15' 
                      : 'hover:bg-accent'
                  }`}
                  aria-label="Tools"
                >
                  <motion.div
                    initial={{ rotate: 180, scale: 0 }}
                    animate={{ rotate: 0, scale: 1 }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                  >
                    <Wrench className={`size-4 ${hasActiveTool ? 'text-primary' : ''}`} />
                  </motion.div>
                </Button>
              </motion.div>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="top" align="center">
            <p>{hasActiveTool ? 'Deactivate tool' : 'Tools'}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <DropdownMenuContent 
        align="center" 
        side="top"
        className="w-56 border-muted/50 shadow-xl"
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
            <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
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
  );
}
