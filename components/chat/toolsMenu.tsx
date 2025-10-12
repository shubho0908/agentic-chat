"use client";

import { useState } from "react";
import { Wrench } from "lucide-react";
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

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <TooltipProvider>
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
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
                <Wrench className={`size-4 ${hasActiveTool ? 'text-primary' : ''}`} />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="top" align="center">
            <p>{hasActiveTool ? 'Deactivate tool' : 'Tools'}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <DropdownMenuContent 
        align="end" 
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
