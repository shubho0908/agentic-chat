"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { useChat } from "@/hooks/useChat";
import { useTokenUsageWithMemory } from "@/hooks/useTokenUsageWithMemory";
import { ChatContainer } from "@/components/chat/chatContainer";
import { ChatInput } from "@/components/chat/chatInput";
import { ChatHeader } from "@/components/chatHeader";
import { EmptyState } from "@/components/emptyState";
import { AuthModal } from "@/components/authModal";
import { LandingPage } from "@/components/landingPage";
import { Loader } from "lucide-react";
import { useSession } from "@/lib/authClient";
import { toast } from "sonner";
import { TOAST_ERROR_MESSAGES } from "@/constants/errors";
import type { Attachment } from "@/lib/schemas/chat";
import { getActiveTool, getMemoryEnabled, getDeepResearchEnabled, getSearchDepth } from "@/lib/storage";
import { Button } from "@/components/ui/button";

const SESSION_LOAD_TIMEOUT_MS = 10_000;

type SessionLoadState = {
  timedOut: boolean;
};

type SessionLoadAction =
  | { type: "reset" }
  | { type: "timeout" };

function sessionLoadReducer(
  state: SessionLoadState,
  action: SessionLoadAction
): SessionLoadState {
  switch (action.type) {
    case "reset":
      return state.timedOut ? { timedOut: false } : state;
    case "timeout":
      return state.timedOut ? state : { timedOut: true };
    default:
      return state;
  }
}

export function HomeContent() {
  const { messages, isLoading, sendMessage, editMessage, regenerateResponse, stopGeneration, clearChat, memoryStatus } = useChat();
  const { tokenUsage, mergedMemoryStatus } = useTokenUsageWithMemory({ memoryStatus });
  const [isConfigured, setIsConfigured] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [{ timedOut }, dispatchSessionLoad] = useReducer(sessionLoadReducer, { timedOut: false });
  const byokTriggerRef = useRef<HTMLButtonElement>(null);
  const { data: session, isPending } = useSession();

  const hasMessages = messages.length > 0;

  useEffect(() => {
    if (!isPending) {
      dispatchSessionLoad({ type: "reset" });
      return;
    }

    dispatchSessionLoad({ type: "reset" });

    const timeoutId = window.setTimeout(() => {
      dispatchSessionLoad({ type: "timeout" });
    }, SESSION_LOAD_TIMEOUT_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isPending]);

  if (isPending && !timedOut) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader className="size-5 animate-spin" />
          <span>Loading...</span>
        </div>
      </div>
    );
  }

  if (isPending && timedOut) {
    return (
      <div className="flex h-screen items-center justify-center bg-background px-6">
        <div className="flex max-w-sm flex-col items-center gap-3 rounded-2xl border border-border/50 bg-card/80 p-6 text-center shadow-sm">
          <div className="text-base font-semibold text-foreground">
            We couldn&apos;t finish loading your session.
          </div>
          <p className="text-sm text-muted-foreground">
            The sign-in request is taking longer than expected. Try again to refresh the session.
          </p>
          <Button type="button" onClick={() => window.location.reload()}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const handleEdit = (messageId: string, content: string, attachments?: Attachment[]) => {
    const activeTool = getActiveTool();
    const memoryEnabled = getMemoryEnabled();
    const deepResearchEnabled = getDeepResearchEnabled();
    return editMessage({ messageId, content, attachments, session: session ?? undefined, activeTool, memoryEnabled, deepResearchEnabled });
  };

  const handleRegenerate = (messageId: string) => {
    const activeTool = getActiveTool();
    const memoryEnabled = getMemoryEnabled();
    const deepResearchEnabled = getDeepResearchEnabled();
    return regenerateResponse({ messageId, session: session ?? undefined, activeTool, memoryEnabled, deepResearchEnabled });
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
    const searchDepth = getSearchDepth();
    await sendMessage({ content, session, attachments, activeTool, memoryEnabled, deepResearchEnabled, searchDepth });
  };

  const handleFollowUpQuestion = async (question: string) => {
    if (!session || !isConfigured) {
      return;
    }
    const activeTool = getActiveTool();
    const memoryEnabled = getMemoryEnabled();
    const deepResearchEnabled = getDeepResearchEnabled();
    const searchDepth = getSearchDepth();
    await sendMessage({
      content: question,
      session,
      activeTool,
      memoryEnabled,
      deepResearchEnabled,
      searchDepth
    });
  };

  if (!hasMessages) {
    if (!isPending && !session) {
      return (
        <>
          <LandingPage onAuthRequired={() => setShowAuthModal(true)} />
          <AuthModal open={showAuthModal} onOpenChange={setShowAuthModal} />
        </>
      );
    }

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
          onAuthRequired={() => setShowAuthModal(true)}
          tokenUsage={tokenUsage}
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
        memoryStatus={mergedMemoryStatus}
        onNewChat={clearChat}
      />
      <ChatInput
        onSend={handleSendMessage}
        isLoading={isLoading}
        onStop={stopGeneration}
        onAuthRequired={() => setShowAuthModal(true)}
        tokenUsage={tokenUsage}
        conversationId={null}
        messages={messages}
      />
      <AuthModal open={showAuthModal} onOpenChange={setShowAuthModal} />
    </div>
  );
}
