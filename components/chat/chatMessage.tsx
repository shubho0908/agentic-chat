import { memo, useState } from "react";
import type { Message, Attachment } from "@/lib/schemas/chat";
import { cn } from "@/lib/utils";
import { AIThinkingAnimation } from "./aiThinkingAnimation";
import { OpenAIIcon } from "@/components/icons/openai-icon";
import { OPENAI_MODELS } from "@/constants/openai-models";
import { Response } from "../ai-elements/response";
import { extractTextFromContent } from "@/lib/content-utils";
import { MessageHeader } from "./messageHeader";
import { MessageEditForm } from "./messageEditForm";
import { VersionNavigator } from "./versionNavigator";
import { AttachmentDisplay } from "./attachmentDisplay";
import { MessageActions } from "./messageActions";

interface ChatMessageProps {
  message: Message;
  userName?: string | null;
  onEdit?: (messageId: string, newContent: string, attachments?: Attachment[]) => void;
  onRegenerate?: (messageId: string) => void;
  isLoading?: boolean;
}

function ChatMessageComponent({ message, userName, onEdit, onRegenerate, isLoading }: ChatMessageProps) {
  const isUser = message.role === "user";
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const [versionIndex, setVersionIndex] = useState(-1);
  
  if (message.role === "system") return null;

  const versions = (message.versions || []) as Message[];
  const totalVersions = versions.length;
  const currentVersion = versionIndex === -1 ? totalVersions : versionIndex + 1;
  
  const displayedMessage: Message = versionIndex === -1 ? message : (versions[versionIndex] || message);
  const displayedContent = displayedMessage.content;
  const displayedAttachments = displayedMessage.attachments;

  const modelName = message.model
    ? OPENAI_MODELS.find((m) => m.id === message.model)?.name || message.model
    : "AI Assistant";

  const userInitial = userName?.charAt(0).toUpperCase() || "U";
  const textContent = extractTextFromContent(displayedContent);
  const isThinking = !textContent && !message.content;
  
  const handleEditStart = () => {
    setEditText(textContent);
    setIsEditing(true);
  };
  
  const handleEditCancel = () => {
    setIsEditing(false);
    setEditText("");
  };
  
  const handleEditSubmit = () => {
    if (!editText.trim() || !displayedMessage.id || !onEdit) return;
    // Always edit the currently displayed version
    onEdit(displayedMessage.id, editText, displayedAttachments);
    setIsEditing(false);
    setEditText("");
    setVersionIndex(-1);
  };
  
  const handlePreviousVersion = () => {
    if (versionIndex === -1) {
      if (versions.length > 0) {
        setVersionIndex(versions.length - 2);
      }
    } else if (versionIndex > 0) {
      setVersionIndex(versionIndex - 1);
    }
  };
  
  const handleNextVersion = () => {
    if (versionIndex === -1) return;
    
    if (versionIndex === versions.length - 2) {
      setVersionIndex(-1);
    } else {
      setVersionIndex(versionIndex + 1);
    }
  };

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
            <div
              className={cn(
                "flex size-8 items-center justify-center rounded-full transition-all",
                isUser
                  ? "bg-gradient-to-br from-primary/20 to-primary/10 border border-primary/20 text-sm font-semibold"
                  : "bg-secondary text-secondary-foreground"
              )}
            >
              {isUser ? (
                userInitial
              ) : (
                <OpenAIIcon className="size-4" />
              )}
            </div>
          </div>

          <div className="flex-1 space-y-2 overflow-hidden">
            <MessageHeader
              isUser={isUser}
              userName={userName}
              modelName={modelName}
              timestamp={displayedMessage.timestamp}
              editHistory={versions.length > 0 ? versions : undefined}
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
                    <AIThinkingAnimation model={message.model} />
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
                    onRegenerate={message.id ? () => onRegenerate?.(message.id!) : undefined}
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

export const ChatMessage = memo(ChatMessageComponent);
