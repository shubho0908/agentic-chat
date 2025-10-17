import { memo, useState, useMemo, useCallback } from "react";
import type { Message, Attachment } from "@/lib/schemas/chat";
import { cn } from "@/lib/utils";
import { AIThinkingAnimation } from "./aiThinkingAnimation";
import { OpenAIIcon } from "@/components/icons/openai-icon";
import { Response } from "../ai-elements/response";
import { extractTextFromContent } from "@/lib/content-utils";
import { MessageHeader } from "./messageHeader";
import { MessageEditForm } from "./messageEditForm";
import { VersionNavigator } from "./versionNavigator";
import { AttachmentDisplay } from "./attachmentDisplay";
import { MessageActions } from "./messageActions";
import { FollowUpQuestions } from "./followUpQuestions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useSession } from "@/lib/auth-client";
import type { MemoryStatus } from "@/types/chat";

interface ChatMessageProps {
  message: Message;
  userName?: string | null;
  onEditMessage?: (messageId: string, newContent: string, attachments?: Attachment[]) => void;
  onRegenerateMessage?: (messageId: string) => void;
  onSendMessage?: (content: string) => void;
  isSharePage?: boolean;
  isLastMessage?: boolean;
  isLoading?: boolean;
  memoryStatus?: MemoryStatus;
}

function ChatMessageComponent({ message, userName, onEditMessage, onRegenerateMessage, onSendMessage, isSharePage = false, isLastMessage = false, isLoading = false, memoryStatus }: ChatMessageProps) {
  const isUser = message.role === "user";
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const [versionIndex, setVersionIndex] = useState(-1);
  const { data: session } = useSession();
  
  const versions = useMemo(() => (message.versions || []) as Message[], [message.versions]);
  const totalVersions = versions.length + 1;
  const currentVersion = versionIndex === -1 ? totalVersions : (totalVersions - 1 - versionIndex);
  
  const displayedMessage = useMemo<Message>(() => {
    const msg = versionIndex === -1 ? message : (versions[versionIndex] || message);
    return msg;
  }, [versionIndex, message, versions]);
  
  const displayedContent = displayedMessage.content;
  const displayedAttachments = displayedMessage.attachments;

  const modelName = "AI Assistant"

  const userInitial = useMemo(() => userName?.charAt(0).toUpperCase() || "U", [userName]);
  const userImage = session?.user?.image;
  const textContent = useMemo(() => extractTextFromContent(displayedContent), [displayedContent]);
  
  const handleEditStart = useCallback(() => {
    setEditText(textContent);
    setIsEditing(true);
  }, [textContent]);
  
  const handleEditCancel = useCallback(() => {
    setIsEditing(false);
    setEditText("");
  }, []);
  
  const handleEditSubmit = useCallback(() => {
    if (!editText.trim() || !message.id || !onEditMessage) return;
    onEditMessage(message.id, editText, message.attachments);
    setIsEditing(false);
    setEditText("");
    setVersionIndex(-1);
  }, [editText, message.id, message.attachments, onEditMessage]);
  
  const handlePreviousVersion = useCallback(() => {
    if (versionIndex === -1) {
      if (versions.length > 0) {
        setVersionIndex(0);
      }
    } else if (versionIndex < versions.length - 1) {
      setVersionIndex(versionIndex + 1);
    }
  }, [versionIndex, versions.length]);
  
  const handleNextVersion = useCallback(() => {
    if (versionIndex === -1) return;
    
    if (versionIndex > 0) {
      setVersionIndex(versionIndex - 1);
    } else {
      setVersionIndex(-1);
    }
  }, [versionIndex]);
  
  const isThinking = !textContent && !displayedMessage.content;
  
  const citations = useMemo(() => {
    if (isUser) return [];
    
    const allCitations = [];
    
    if (displayedMessage.metadata?.citations && displayedMessage.metadata.citations.length > 0) {
      allCitations.push(...displayedMessage.metadata.citations);
    }
    
    if (displayedMessage.metadata?.sources && displayedMessage.metadata.sources.length > 0) {
      const sourcesAsCitations = displayedMessage.metadata.sources.map((source, index) => ({
        id: `source-${index + 1}`,
        source: source.title,
        url: source.url,
        relevance: source.snippet || `Source from ${source.domain}`,
        author: source.domain,
        year: new Date().getFullYear().toString(),
      }));
      allCitations.push(...sourcesAsCitations);
    }
    
    if (isLastMessage && memoryStatus?.toolProgress?.details?.citations) {
      allCitations.push(...memoryStatus.toolProgress.details.citations);
    }
    
    const uniqueCitations = allCitations.reduce((acc, citation) => {
      const existing = acc.find((c) => c.url && citation.url && c.url === citation.url);
      if (!existing) {
        acc.push(citation);
      }
      return acc;
    }, [] as typeof allCitations);
    
    return uniqueCitations;
  }, [isUser, isLastMessage, displayedMessage.metadata?.citations, displayedMessage.metadata?.sources, memoryStatus?.toolProgress?.details?.citations]);
  
  const followUpQuestions = useMemo(() => {
    if (isUser) return [];
    
    if (displayedMessage.metadata?.followUpQuestions && displayedMessage.metadata.followUpQuestions.length > 0 && !isLoading) {
      if (isLastMessage) {
        return displayedMessage.metadata.followUpQuestions;
      }
    }
    
    return [];
  }, [isUser, isLastMessage, isLoading, displayedMessage.metadata?.followUpQuestions]);
  
  if (message.role === "system") return null;

  return (
    <div
      className={cn(
        "group relative px-4 py-8 transition-colors w-screen md:w-full",
        !isUser && "bg-muted/30"
      )}
    >
      <div className="mx-auto max-w-3xl">
        <div className="flex gap-4">
          <div className="flex-shrink-0">
            {isUser ? (
              <Avatar className="size-8 border border-primary/20">
                <AvatarImage src={userImage || undefined} alt={userName || "User"} />
                <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary/10 text-sm font-semibold">
                  {userInitial}
                </AvatarFallback>
              </Avatar>
            ) : (
              <div className="flex size-8 items-center justify-center rounded-full bg-secondary text-secondary-foreground transition-all">
                <OpenAIIcon className="size-4" />
              </div>
            )}
          </div>

          <div className="flex-1 space-y-2 overflow-hidden">
            <MessageHeader
              isUser={isUser}
              userName={userName}
              modelName={modelName}
              timestamp={displayedMessage.timestamp}
              citations={citations}
            />

            <AttachmentDisplay
              attachments={displayedAttachments}
              messageId={message.id}
            />

            {isEditing ? (
              <MessageEditForm
                editText={editText}
                onEditTextChange={setEditText}
                onSubmit={handleEditSubmit}
                onCancel={handleEditCancel}
              />
            ) : (
              <>
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  {textContent ? (
                    <Response>{textContent}</Response>
                  ) : message.content ? (
                    <Response>{typeof message.content === 'string' ? message.content : ''}</Response>
                  ) : (
                    <AIThinkingAnimation 
                      memoryStatus={memoryStatus}
                      isLoading={isLoading}
                    />
                  )}
                </div>
                
                {!isUser && followUpQuestions.length > 0 && (
                  <FollowUpQuestions 
                    questions={followUpQuestions}
                    onQuestionClick={onSendMessage}
                    disabled={isSharePage}
                  />
                )}
                
                {isUser && totalVersions > 0 && (
                  <VersionNavigator
                    currentVersion={currentVersion}
                    totalVersions={totalVersions}
                    historyIndex={versionIndex}
                    historyLength={versions.length}
                    onPrevious={handlePreviousVersion}
                    onNext={handleNextVersion}
                  />
                )}
                
                {!isSharePage && (
                  <div className="mt-2">
                    <MessageActions
                      isUser={isUser}
                      isEditing={isEditing}
                      textContent={textContent}
                      onEditStart={handleEditStart}
                      canEdit={!!onEditMessage}
                      onRegenerate={onRegenerateMessage && message.id ? () => onRegenerateMessage(message.id!) : undefined}
                      isThinking={isThinking}
                      isLoading={isLoading}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export const ChatMessage = memo(ChatMessageComponent, (prevProps, nextProps) => {
  if (
    prevProps.message.id !== nextProps.message.id ||
    prevProps.message.content !== nextProps.message.content ||
    prevProps.isLastMessage !== nextProps.isLastMessage ||
    prevProps.isLoading !== nextProps.isLoading
  ) {
    return false;
  }

  const prevMetadata = prevProps.message.metadata;
  const nextMetadata = nextProps.message.metadata;
  
  if (
    prevMetadata?.citations?.length !== nextMetadata?.citations?.length ||
    prevMetadata?.sources?.length !== nextMetadata?.sources?.length ||
    prevMetadata?.followUpQuestions?.length !== nextMetadata?.followUpQuestions?.length
  ) {
    return false;
  }

  if (prevProps.isLastMessage && nextProps.isLastMessage) {
    const prevCitations = prevProps.memoryStatus?.toolProgress?.details?.citations;
    const nextCitations = nextProps.memoryStatus?.toolProgress?.details?.citations;
    
    if (prevCitations?.length !== nextCitations?.length) {
      return false;
    }
    
    const prevProgress = prevProps.memoryStatus?.toolProgress;
    const nextProgress = nextProps.memoryStatus?.toolProgress;
    
    if (prevProgress?.status !== nextProgress?.status ||
        prevProgress?.message !== nextProgress?.message ||
        prevProgress?.details?.status !== nextProgress?.details?.status ||
        prevProgress?.details?.currentTaskIndex !== nextProgress?.details?.currentTaskIndex ||
        prevProgress?.details?.researchPlan?.length !== nextProgress?.details?.researchPlan?.length ||
        prevProgress?.details?.completedTasks?.length !== nextProgress?.details?.completedTasks?.length) {
      return false;
    }
  }

  return true;
});
