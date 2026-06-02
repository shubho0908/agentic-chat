"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader } from "lucide-react";
import { cn } from "@/lib/utils";
import { useChat } from "@/hooks/useChat";
import { useTokenUsageWithMemory } from "@/hooks/useTokenUsageWithMemory";
import { useConversation } from "@/hooks/useConversation";
import { useConversations } from "@/hooks/useConversations";
import { ChatContainer } from "@/components/chat/chatContainer";
import { ChatInput } from "@/components/chat/chatInput";
import { ChatHeader } from "@/components/chatHeader";
import { ConversationNotFound } from "@/components/conversationNotFound";
import { AuthModal } from "@/components/authModal";
import { ArtifactProvider, useArtifacts } from "@/contexts/artifact-context";
import { ArtifactPanel } from "@/components/artifacts/ArtifactPanel";
import { useSession } from "@/lib/authClient";
import { useApiKey } from "@/hooks/useApiKey";
import { toast } from "sonner";
import { TOAST_ERROR_MESSAGES } from "@/constants/errors";
import type { Attachment } from "@/lib/schemas/chat";
import { convertDbMessagesToFrontend, flattenMessageTree } from "@/lib/messageUtils";
import { getMemoryEnabled, getThinkingEnabled } from "@/lib/storage";

interface ChatPageClientProps {
  conversationId: string;
}

export function ChatPageClient({ conversationId }: ChatPageClientProps) {
  return (
    <ArtifactProvider>
      <ChatPageInner conversationId={conversationId} />
    </ArtifactProvider>
  );
}

function ChatPageInner({ conversationId }: ChatPageClientProps) {
  const { data: session, isPending } = useSession();
  const { handleArtifactEvent, hydrateMessageArtifacts, openArtifactFromMetadata, panelOpen } = useArtifacts();
  const {
    data: conversationData,
    error: conversationError,
    isLoading: isLoadingConversation,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage
  } = useConversation(conversationId);
  const { toggleSharing, isToggling } = useConversations({ enabled: !!session });
  const conversationItems = conversationData?.messages.items;

  const initialMessages = useMemo(() => {
    if (!conversationItems) return [];

    const dbMessages = convertDbMessagesToFrontend(conversationItems);
    return flattenMessageTree(dbMessages);
  }, [conversationItems]);

  const isPublic = conversationData?.conversation.isPublic ?? false;

  const { messages, isLoading, sendMessage, editMessage, regenerateResponse, respondToHumanInTheLoop, stopGeneration, clearChat, memoryStatus } = useChat({
    initialMessages,
    conversationId,
    onArtifact: handleArtifactEvent,
    autoContinue: session ? {
      session: session as { user: { id: string } },
      memoryEnabled: getMemoryEnabled(),
      thinkingEnabled: getThinkingEnabled(),
    } : null,
  });
  const { tokenUsage, mergedMemoryStatus } = useTokenUsageWithMemory({
    memoryStatus,
    conversationTokenUsage: conversationData?.tokenUsage
  });

  useEffect(() => {
    for (const message of messages) {
      if (message.id && message.metadata?.artifacts?.length) {
        hydrateMessageArtifacts(message.id, message.metadata.artifacts);
      }

      for (const version of message.versions ?? []) {
        if (version.id && version.metadata?.artifacts?.length) {
          hydrateMessageArtifacts(version.id, version.metadata.artifacts);
        }
      }
    }
  }, [hydrateMessageArtifacts, messages]);

  const { data: apiKeyData } = useApiKey();
  const isConfigured = apiKeyData?.exists ?? false;
  const [showAuthModal, setShowAuthModal] = useState(false);
  const byokTriggerRef = useRef<HTMLButtonElement>(null);

  const conversationNotFound = !!conversationError;

  const handleEdit = (messageId: string, content: string, attachments?: Attachment[]) => {
    const memoryEnabled = getMemoryEnabled();
    const thinkingEnabled = getThinkingEnabled();
    return editMessage({ messageId, content, attachments, session: session ?? undefined, memoryEnabled, thinkingEnabled });
  };

  const handleRegenerate = (messageId: string) => {
    const memoryEnabled = getMemoryEnabled();
    const thinkingEnabled = getThinkingEnabled();
    return regenerateResponse({ messageId, session: session ?? undefined, memoryEnabled, thinkingEnabled });
  };

  const handleToggleSharing = (id: string, nextIsPublic: boolean) => {
    toggleSharing({ id, isPublic: nextIsPublic });
  };

  const handleSendMessage = async (content: string, attachments?: Attachment[], _activeTool?: string | null, memoryEnabled?: boolean, thinkingEnabled?: boolean) => {
    if (isPending) {
      return { success: false, error: "Session is loading" };
    }

    if (!session) {
      toast.error(TOAST_ERROR_MESSAGES.AUTH.REQUIRED, {
        description: TOAST_ERROR_MESSAGES.AUTH.REQUIRED_DESCRIPTION,
      });
      return { success: false, error: "Authentication required" };
    }

    if (!isConfigured) {
      toast.error(TOAST_ERROR_MESSAGES.API_KEY.REQUIRED, {
        description: TOAST_ERROR_MESSAGES.API_KEY.REQUIRED_DESCRIPTION,
      });
      byokTriggerRef.current?.click();
      return { success: false, error: "API key required" };
    }
    return sendMessage({ content, session, attachments, memoryEnabled, thinkingEnabled });
  };

  const handleFollowUpQuestion = async (question: string) => {
    if (!session || !isConfigured) {
      return;
    }
    const memoryEnabled = getMemoryEnabled();
    const thinkingEnabled = getThinkingEnabled();
    await sendMessage({
      content: question,
      session,
      memoryEnabled,
      thinkingEnabled
    });
  };

  if (conversationNotFound) {
    return <ConversationNotFound isAuthenticated={!!session} />;
  }

  if (isLoadingConversation && messages.length === 0) {
    return (
      <>
        <ChatHeader
          onNewChat={clearChat}
          byokTriggerRef={byokTriggerRef}
          autoOpenByok={false}
          conversationId={conversationId}
          isPublic={isPublic}
          onToggleSharing={handleToggleSharing}
          isToggling={isToggling}
        />
        <div className="flex h-full items-center justify-center">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader className="size-5 animate-spin" />
            <span>Loading conversation…</span>
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <div className={cn(
        "flex h-full min-w-0 flex-col transition-[width] duration-200 ease-out",
        panelOpen ? "hidden lg:flex lg:w-1/2" : "w-full"
      )}>
        <ChatHeader
          onNewChat={clearChat}
          byokTriggerRef={byokTriggerRef}
          conversationId={conversationId}
          isPublic={isPublic}
          onToggleSharing={handleToggleSharing}
          isToggling={isToggling}
          artifactOpen={panelOpen}
        />
        <ChatContainer
          messages={messages}
          isLoading={isLoading}
          userName={session?.user?.name}
          onEditMessage={handleEdit}
          onRegenerateMessage={handleRegenerate}
          onSendMessage={handleFollowUpQuestion}
          onHumanInTheLoopDecision={respondToHumanInTheLoop}
          memoryStatus={mergedMemoryStatus}
          hasNextPage={hasNextPage}
          fetchNextPage={fetchNextPage}
          isFetchingNextPage={isFetchingNextPage}
          onNewChat={clearChat}
          onOpenArtifact={openArtifactFromMetadata}
        />
        <ChatInput
          onSend={handleSendMessage}
          isLoading={isLoading}
          onStop={stopGeneration}
          onAuthRequired={() => setShowAuthModal(true)}
          tokenUsage={tokenUsage}
          conversationId={conversationId}
          messages={messages}
        />
      </div>
      <div className={cn(
        "h-full w-full min-w-0 lg:w-1/2 transition-[transform,opacity] duration-200 ease-out",
        panelOpen ? "animate-in slide-in-from-right-5" : "hidden"
      )}>
        <ArtifactPanel />
      </div>
      <AuthModal open={showAuthModal} onOpenChange={setShowAuthModal} />
    </div>
  );
}
