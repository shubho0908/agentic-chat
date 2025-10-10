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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useSession } from "@/lib/auth-client";

interface ChatMessageProps {
  message: Message;
  userName?: string | null;
  onEdit?: (messageId: string, newContent: string, attachments?: Attachment[]) => void;
  onRegenerate?: (messageId: string) => void;
  isLoading?: boolean;
  memoryStatus?: {
    hasMemories: boolean;
    hasDocuments: boolean;
    memoryCount: number;
    documentCount: number;
    hasImages: boolean;
    imageCount: number;
    routingDecision?: 'vision-only' | 'documents-only' | 'memory-only';
    skippedMemory?: boolean;
  };
}

function ChatMessageComponent({ message, userName, onEdit, onRegenerate, isLoading, memoryStatus }: ChatMessageProps) {
  const isUser = message.role === "user";
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const [versionIndex, setVersionIndex] = useState(-1);
  const { data: session } = useSession();
  
  const versions = useMemo(() => (message.versions || []) as Message[], [message.versions]);
  const totalVersions = versions.length + 1;
  const currentVersion = versionIndex === -1 ? totalVersions : (totalVersions - 1 - versionIndex);
  
  const displayedMessage = useMemo<Message>(
    () => versionIndex === -1 ? message : (versions[versionIndex] || message),
    [versionIndex, message, versions]
  );
  
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
    if (!editText.trim() || !message.id || !onEdit) return;
    onEdit(message.id, editText, message.attachments);
    setIsEditing(false);
    setEditText("");
    setVersionIndex(-1);
  }, [editText, message.id, message.attachments, onEdit]);
  
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
                    <AIThinkingAnimation memoryStatus={memoryStatus} />
                  )}
                </div>
                
                {totalVersions > 0 && (
                  <VersionNavigator
                    currentVersion={currentVersion}
                    totalVersions={totalVersions}
                    historyIndex={versionIndex}
                    historyLength={versions.length}
                    onPrevious={handlePreviousVersion}
                    onNext={handleNextVersion}
                  />
                )}
                
                <div className="mt-2">
                  <MessageActions
                    isUser={isUser}
                    isEditing={isEditing}
                    textContent={textContent}
                    onEditStart={handleEditStart}
                    canEdit={!!onEdit}
                    onRegenerate={onRegenerate && message.id ? () => onRegenerate(message.id!) : undefined}
                    isThinking={isThinking}
                    isLoading={isLoading}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export const ChatMessage = memo(ChatMessageComponent, (prevProps, nextProps) => {
  return (
    prevProps.message.id === nextProps.message.id &&
    prevProps.message.content === nextProps.message.content &&
    prevProps.message.versions?.length === nextProps.message.versions?.length &&
    prevProps.userName === nextProps.userName &&
    prevProps.isLoading === nextProps.isLoading &&
    prevProps.onEdit === nextProps.onEdit &&
    prevProps.onRegenerate === nextProps.onRegenerate &&
    prevProps.memoryStatus?.hasMemories === nextProps.memoryStatus?.hasMemories &&
    prevProps.memoryStatus?.hasDocuments === nextProps.memoryStatus?.hasDocuments &&
    prevProps.memoryStatus?.memoryCount === nextProps.memoryStatus?.memoryCount &&
    prevProps.memoryStatus?.documentCount === nextProps.memoryStatus?.documentCount &&
    prevProps.memoryStatus?.hasImages === nextProps.memoryStatus?.hasImages &&
    prevProps.memoryStatus?.imageCount === nextProps.memoryStatus?.imageCount &&
    prevProps.memoryStatus?.routingDecision === nextProps.memoryStatus?.routingDecision &&
    prevProps.memoryStatus?.skippedMemory === nextProps.memoryStatus?.skippedMemory
  );
});
