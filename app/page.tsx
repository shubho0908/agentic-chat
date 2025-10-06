"use client";

import { useState, useRef } from "react";
import { useChat } from "@/hooks/useChat";
import { ChatContainer } from "@/components/chat/chatContainer";
import { ChatInput } from "@/components/chat/chatInput";
import { ChatHeader } from "@/components/chatHeader";
import { EmptyState } from "@/components/emptyState";
import { AuthModal } from "@/components/authModal";
import { useSession } from "@/lib/auth-client";
import { toast } from "sonner";

export default function Home() {
  const { messages, isLoading, sendMessage, stopGeneration, clearChat } = useChat();
  const [isConfigured, setIsConfigured] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const byokTriggerRef = useRef<HTMLButtonElement>(null);
  const { data: session, isPending } = useSession();

  const hasMessages = messages.length > 0;

  const handleSendMessage = async (content: string) => {
    if (isPending) {
      return;
    }

    if (!session) {
      setShowAuthModal(true);
      toast.error("Authentication Required", {
        description: "Please login to start chatting",
      });
      return;
    }

    if (!isConfigured) {
      toast.error("API Key Required", {
        description: "Please configure your OpenAI API key first",
      });
      byokTriggerRef.current?.click();
      return;
    }
    await sendMessage(content);
  };

  if (!hasMessages) {
    return (
      <>
        <ChatHeader 
          onConfigured={setIsConfigured}
          onNewChat={clearChat}
          byokTriggerRef={byokTriggerRef}
          autoOpenByok={true}
        />
        <EmptyState
          onSend={handleSendMessage}
          isLoading={isLoading}
          onStop={stopGeneration}
        />
        <AuthModal open={showAuthModal} onOpenChange={setShowAuthModal} />
      </>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      <ChatHeader 
        onConfigured={setIsConfigured}
        onNewChat={clearChat}
        showNewChat={true}
        byokTriggerRef={byokTriggerRef}
      />
      <ChatContainer messages={messages} isLoading={isLoading} />
      <ChatInput
        onSend={handleSendMessage}
        isLoading={isLoading}
        onStop={stopGeneration}
      />
      <AuthModal open={showAuthModal} onOpenChange={setShowAuthModal} />
    </div>
  );
}
