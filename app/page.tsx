"use client";

import { useState, useRef } from "react";
import { useChat } from "@/hooks/useChat";
import { ChatContainer } from "@/components/chat/chatContainer";
import { ChatInput } from "@/components/chat/chatInput";
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
import { Plus } from "lucide-react";
import { BYOK } from "@/components/byok";
import { toast } from "sonner";

export default function Home() {
  const { messages, isLoading, sendMessage, stopGeneration, clearChat } = useChat();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isConfigured, setIsConfigured] = useState(false);
  const byokTriggerRef = useRef<HTMLButtonElement>(null);

  const hasMessages = messages.length > 0;

  const handleSendMessage = async (content: string) => {
    if (!isConfigured) {
      toast.error("API Key Required", {
        description: "Please configure your OpenAI API key first",
      });
      byokTriggerRef.current?.click();
      return;
    }
    await sendMessage(content);
  };

  function handleNewChat() {
    clearChat();
    setDialogOpen(false);
  }

  if (!hasMessages) {
    return (
      <>
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2">
          <BYOK 
            autoOpen={true} 
            onConfigured={setIsConfigured}
            triggerRef={byokTriggerRef}
          />
          <ThemeToggle />
        </div>
        <ChatInput
          onSend={handleSendMessage}
          isLoading={isLoading}
          onStop={stopGeneration}
          centered
        />
      </>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      <div className="fixed top-4 right-4 z-50 flex items-center gap-2">
        <BYOK 
          onConfigured={setIsConfigured}
          triggerRef={byokTriggerRef}
        />
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
        <ThemeToggle />
      </div>

      <ChatContainer messages={messages} isLoading={isLoading} />
      <ChatInput
        onSend={handleSendMessage}
        isLoading={isLoading}
        onStop={stopGeneration}
      />
    </div>
  );
}
