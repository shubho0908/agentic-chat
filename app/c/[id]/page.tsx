"use client";

import { use, useMemo, useRef, useState } from "react";
import { Loader } from "lucide-react";
import { useChat } from "@/hooks/useChat";
import { useConversation } from "@/hooks/useConversation";
import { useConversations } from "@/hooks/useConversations";
import { ChatContainer } from "@/components/chat/chatContainer";
import { ChatInput } from "@/components/chat/chatInput";
import { ChatHeader } from "@/components/chatHeader";
import { ConversationNotFound } from "@/components/conversationNotFound";
import { useSession } from "@/lib/auth-client";
import { toast } from "sonner";
import { TOAST_ERROR_MESSAGES } from "@/constants/errors";
import type { Attachment } from "@/lib/schemas/chat";
import { convertDbMessagesToFrontend, flattenMessageTree } from "@/lib/message-utils";

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

  const { messages, isLoading, sendMessage, editMessage, regenerateResponse, stopGeneration, clearChat, memoryStatus } = useChat({
    initialMessages,
    conversationId,
  });
  
  const [isConfigured, setIsConfigured] = useState(false);
  const byokTriggerRef = useRef<HTMLButtonElement>(null);
  const { data: session, isPending } = useSession();

  const conversationNotFound = !!conversationError;

  const handleEdit = (messageId: string, content: string, attachments?: Attachment[]) => {
    const activeTool = localStorage.getItem('agentic-chat-active-tool');
    return editMessage({ messageId, content, attachments, activeTool });
  };

  const handleRegenerate = (messageId: string) => {
    const activeTool = localStorage.getItem('agentic-chat-active-tool');
    return regenerateResponse({ messageId, activeTool });
  };

  const handleToggleSharing = (id: string, isPublic: boolean) => {
    toggleSharing({ id, isPublic });
  };

  const handleSendMessage = async (content: string, attachments?: Attachment[], activeTool?: string | null) => {
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
    await sendMessage({ content, session, attachments, activeTool });
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
        memoryStatus={memoryStatus}
        hasNextPage={hasNextPage}
        fetchNextPage={fetchNextPage}
        isFetchingNextPage={isFetchingNextPage}
      />
      <ChatInput
        onSend={handleSendMessage}
        isLoading={isLoading}
        onStop={stopGeneration}
      />
    </div>
  );
}
