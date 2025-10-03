"use client";

import { useState } from "react";
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

export default function Home() {
  const { messages, isLoading, sendMessage, stopGeneration, clearChat } = useChat();
  const [dialogOpen, setDialogOpen] = useState(false);

  const hasMessages = messages.length > 0;

  function handleNewChat() {
    clearChat();
    setDialogOpen(false);
  }

  if (!hasMessages) {
    return (
      <ChatInput
        onSend={sendMessage}
        isLoading={isLoading}
        onStop={stopGeneration}
        centered
      />
    );
  }

  return (
    <div className="flex h-screen flex-col">
      <div className="fixed top-4 right-4 z-50 flex items-center gap-2 animate-in fade-in duration-500">
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
          <AlertDialogContent>
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
        onSend={sendMessage}
        isLoading={isLoading}
        onStop={stopGeneration}
      />
    </div>
  );
}
