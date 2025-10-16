"use client";

import { useState, useRef, Suspense } from "react";
import { Loader } from "lucide-react";
import { useChat } from "@/hooks/useChat";
import { ChatContainer } from "@/components/chat/chatContainer";
import { ChatInput } from "@/components/chat/chatInput";
import { ChatHeader } from "@/components/chatHeader";
import { EmptyState } from "@/components/emptyState";
import { AuthModal } from "@/components/authModal";
import { useSession } from "@/lib/auth-client";
import { toast } from "sonner";
import { TOAST_ERROR_MESSAGES } from "@/constants/errors";
import type { Attachment } from "@/lib/schemas/chat";
import { getActiveTool, getMemoryEnabled, getDeepResearchEnabled } from "@/lib/storage";

function HomeContent() {
  const { messages, isLoading, sendMessage, editMessage, regenerateResponse, stopGeneration, clearChat, memoryStatus } = useChat();
  const [isConfigured, setIsConfigured] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const byokTriggerRef = useRef<HTMLButtonElement>(null);
  const { data: session, isPending } = useSession();

  const hasMessages = messages.length > 0;
  
  const handleEdit = (messageId: string, content: string, attachments?: Attachment[]) => {
    const activeTool = getActiveTool();
    const memoryEnabled = getMemoryEnabled();
    const deepResearchEnabled = getDeepResearchEnabled();
    return editMessage({ messageId, content, attachments, activeTool, memoryEnabled, deepResearchEnabled });
  };

  const handleRegenerate = (messageId: string) => {
    const activeTool = getActiveTool();
    const memoryEnabled = getMemoryEnabled();
    const deepResearchEnabled = getDeepResearchEnabled();
    return regenerateResponse({ messageId, activeTool, memoryEnabled, deepResearchEnabled });
  };

  const handleSendMessage = async (content: string, attachments?: Attachment[], activeTool?: string | null, memoryEnabled?: boolean, deepResearchEnabled?: boolean) => {
    if (isPending) {
      return;
    }

    if (!session) {
      setShowAuthModal(true);
      toast.error(TOAST_ERROR_MESSAGES.AUTH.REQUIRED, {
        description: TOAST_ERROR_MESSAGES.AUTH.REQUIRED_DESCRIPTION,
      });
      return;
    }

    if (!isConfigured) {
      toast.error(TOAST_ERROR_MESSAGES.API_KEY.REQUIRED, {
        description: TOAST_ERROR_MESSAGES.API_KEY.REQUIRED_DESCRIPTION,
      });
      byokTriggerRef.current?.click();
      return;
    }
    await sendMessage({ content, session, attachments, activeTool, memoryEnabled, deepResearchEnabled });
  };

  const handleFollowUpQuestion = async (question: string) => {
    if (!session || !isConfigured) {
      return;
    }
    const activeTool = getActiveTool();
    const memoryEnabled = getMemoryEnabled();
    const deepResearchEnabled = getDeepResearchEnabled();
    await sendMessage({ 
      content: question, 
      session, 
      activeTool, 
      memoryEnabled, 
      deepResearchEnabled 
    });
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
        byokTriggerRef={byokTriggerRef}
      />
      <ChatContainer 
        messages={messages} 
        isLoading={isLoading}
        userName={session?.user?.name}
        onEditMessage={handleEdit}
        onRegenerateMessage={handleRegenerate}
        onSendMessage={handleFollowUpQuestion}
        memoryStatus={memoryStatus}
      />
      <ChatInput
        onSend={handleSendMessage}
        isLoading={isLoading}
        onStop={stopGeneration}
      />
      <AuthModal open={showAuthModal} onOpenChange={setShowAuthModal} />
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={
      <div className="flex h-screen items-center justify-center">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader className="size-5 animate-spin" />
          <span>Loading...</span>
        </div>
      </div>
    }>
      <HomeContent />
    </Suspense>
  );
}
