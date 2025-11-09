"use client";

import { use, useMemo, useRef, useState, useEffect } from "react";
import { Loader } from "lucide-react";
import { useChat } from "@/hooks/useChat";
import { useTokenUsageWithMemory } from "@/hooks/useTokenUsageWithMemory";
import { useConversation } from "@/hooks/useConversation";
import { useConversations } from "@/hooks/useConversations";
import { ChatContainer } from "@/components/chat/chatContainer";
import { ChatInput } from "@/components/chat/chatInput";
import { ChatHeader } from "@/components/chatHeader";
import { ConversationNotFound } from "@/components/conversationNotFound";
import { AuthModal } from "@/components/authModal";
import { useSession } from "@/lib/auth-client";
import { toast } from "sonner";
import { TOAST_ERROR_MESSAGES } from "@/constants/errors";
import type { Attachment } from "@/lib/schemas/chat";
import { convertDbMessagesToFrontend, flattenMessageTree } from "@/lib/message-utils";
import { getActiveTool, getMemoryEnabled, getDeepResearchEnabled, getSearchDepth } from "@/lib/storage";

export default function ChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: conversationId } = use(params);
  const {
    data: conversationData,
    error: conversationError,
    isLoading: isLoadingConversation,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage
  } = useConversation(conversationId);
  const { toggleSharing, isToggling } = useConversations();

  const initialMessages = useMemo(() => {
    if (!conversationData?.messages.items) return [];

    const dbMessages = convertDbMessagesToFrontend(conversationData.messages.items);
    return flattenMessageTree(dbMessages);
  }, [conversationData?.messages.items]);

  const isPublic = conversationData?.conversation.isPublic ?? false;

  const { messages, isLoading, sendMessage, editMessage, regenerateResponse, continueConversation, stopGeneration, clearChat, memoryStatus } = useChat({
    initialMessages,
    conversationId,
  });
  const { tokenUsage, mergedMemoryStatus } = useTokenUsageWithMemory({
    memoryStatus,
    conversationTokenUsage: conversationData?.tokenUsage
  });

  const [isConfigured, setIsConfigured] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const byokTriggerRef = useRef<HTMLButtonElement>(null);
  const { data: session, isPending } = useSession();
  const autoTriggerStateRef = useRef<{ conversationId: string | null; triggered: boolean }>({
    conversationId: null,
    triggered: false,
  });

  const conversationNotFound = !!conversationError;

  useEffect(() => {
    if (autoTriggerStateRef.current.conversationId !== conversationId) {
      autoTriggerStateRef.current = { conversationId, triggered: false };
    }
    if (autoTriggerStateRef.current.triggered || messages.length === 0 || isLoading || !session || !isConfigured) {
      return;
    }

    const lastMessage = messages[messages.length - 1];
    const lastUserMessage = messages.findLast(msg => msg.role === 'user');
    const isIncomplete =
      (lastMessage?.role === 'user' && lastMessage.id) ||
      (lastMessage?.role === 'assistant' && !lastMessage.content && lastUserMessage?.id);

    if (isIncomplete && lastUserMessage?.id) {
      autoTriggerStateRef.current.triggered = true;

      const activeTool = getActiveTool();
      const memoryEnabled = getMemoryEnabled();
      const deepResearchEnabled = getDeepResearchEnabled();
      const searchDepth = getSearchDepth();

      continueConversation({
        userMessage: lastUserMessage,
        session,
        activeTool,
        memoryEnabled,
        deepResearchEnabled,
        searchDepth
      });
    }
  }, [conversationId, messages, isLoading, session, isConfigured, continueConversation]);

  const handleEdit = (messageId: string, content: string, attachments?: Attachment[]) => {
    const activeTool = getActiveTool();
    const memoryEnabled = getMemoryEnabled();
    const deepResearchEnabled = getDeepResearchEnabled();
    const searchDepth = getSearchDepth();
    return editMessage({ messageId, content, attachments, activeTool, memoryEnabled, deepResearchEnabled, searchDepth });
  };

  const handleRegenerate = (messageId: string) => {
    const activeTool = getActiveTool();
    const memoryEnabled = getMemoryEnabled();
    const deepResearchEnabled = getDeepResearchEnabled();
    const searchDepth = getSearchDepth();
    return regenerateResponse({ messageId, activeTool, memoryEnabled, deepResearchEnabled, searchDepth });
  };

  const handleToggleSharing = (id: string, isPublic: boolean) => {
    toggleSharing({ id, isPublic });
  };

  const handleSendMessage = async (content: string, attachments?: Attachment[], activeTool?: string | null, memoryEnabled?: boolean, deepResearchEnabled?: boolean) => {
    if (isPending) {
      return;
    }

    if (!session) {
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

  if (conversationNotFound) {
    return <ConversationNotFound isAuthenticated={!!session} />;
  }

  if (isLoadingConversation && messages.length === 0) {
    return (
      <>
        <ChatHeader 
          onConfigured={setIsConfigured}
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
            <span>Loading conversation...</span>
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      <ChatHeader 
        onConfigured={setIsConfigured}
        onNewChat={clearChat}
        byokTriggerRef={byokTriggerRef}
        conversationId={conversationId}
        isPublic={isPublic}
        onToggleSharing={handleToggleSharing}
        isToggling={isToggling}
      />
      <ChatContainer
        messages={messages}
        isLoading={isLoading}
        userName={session?.user?.name}
        onEditMessage={handleEdit}
        onRegenerateMessage={handleRegenerate}
        onSendMessage={handleFollowUpQuestion}
        memoryStatus={mergedMemoryStatus}
        hasNextPage={hasNextPage}
        fetchNextPage={fetchNextPage}
        isFetchingNextPage={isFetchingNextPage}
        onNewChat={clearChat}
      />
      <ChatInput
        onSend={handleSendMessage}
        isLoading={isLoading}
        onStop={stopGeneration}
        onAuthRequired={() => setShowAuthModal(true)}
        tokenUsage={tokenUsage}
        conversationId={conversationId}
      />
      <AuthModal open={showAuthModal} onOpenChange={setShowAuthModal} />
    </div>
  );
}
