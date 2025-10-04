"use client";

import { type RefObject, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/themeToggle";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alertDialog";
import { BYOK } from "@/components/byok";

interface ChatHeaderProps {
  onConfigured: (configured: boolean) => void;
  onNewChat: () => void;
  showNewChat?: boolean;
  byokTriggerRef?: RefObject<HTMLButtonElement | null>;
  autoOpenByok?: boolean;
}

export function ChatHeader({ 
  onConfigured, 
  onNewChat, 
  showNewChat = false,
  byokTriggerRef,
  autoOpenByok = false 
}: ChatHeaderProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  function handleNewChat() {
    onNewChat();
    setDialogOpen(false);
  }

  return (
    <div className="fixed top-4 right-4 z-50 flex items-center gap-2">
      <BYOK 
        autoOpen={autoOpenByok}
        onConfigured={onConfigured}
        triggerRef={byokTriggerRef}
      />
      {showNewChat && (
        <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 rounded-xl bg-background/80 backdrop-blur-sm shadow-sm hover:shadow-md transition-all"
            >
              <Plus className="size-4" />
              <span className="hidden sm:inline">New Chat</span>
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent className="border border-border/40">
            <AlertDialogHeader>
              <AlertDialogTitle>Start a new chat?</AlertDialogTitle>
              <AlertDialogDescription>
                This will clear your current conversation. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleNewChat}>
                Continue
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
      <ThemeToggle />
    </div>
  );
}
