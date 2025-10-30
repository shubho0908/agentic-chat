"use client";

import { useEffect } from "react";
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface SidebarTriggerWithShortcutProps {
  className?: string;
  showTooltip?: boolean;
}

function KeyboardKey({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
      {children}
    </kbd>
  );
}

export function SidebarTriggerWithShortcut({ className, showTooltip = true }: SidebarTriggerWithShortcutProps) {
  const { toggleSidebar, state } = useSidebar();

  const isMac = typeof navigator !== 'undefined' 
    ? /Mac|iPhone|iPod|iPad/i.test(navigator.userAgent)
    : false;

  const modifierKey = isMac ? "⌘" : "Ctrl";

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'b') {
        event.preventDefault();
        toggleSidebar();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleSidebar]);

  if (!showTooltip) {
    return <SidebarTrigger className={cn(className)} />;
  }

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <SidebarTrigger className={cn(className)} />
        </TooltipTrigger>
        <TooltipContent side="right" align="start" className="flex items-center gap-2">
          <span className="text-muted-foreground">
            {state === "collapsed" ? "Open" : "Close"} sidebar
          </span>
          <div className="flex items-center gap-1">
            <KeyboardKey>
              <span className="text-lg">{modifierKey}</span>
            </KeyboardKey>
            <span className="text-xs text-muted-foreground">+</span>
            <KeyboardKey>
              <span className="text-[12px]">B</span>
            </KeyboardKey>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
