import { memo, useState, useMemo, useCallback, type ReactNode } from "react";
import type { Message, Attachment } from "@/lib/schemas/chat";
import { cn } from "@/lib/utils";
import { AIThinkingAnimation } from "./aiThinkingAnimation";
import { ThinkingAccordion } from "./thinkingAccordion";
import { Response } from "../ai-elements/response";
import { extractTextFromContent } from "@/lib/contentUtils";
import { MessageHeader } from "./messageHeader";
import { MessageEditForm } from "./messageEditForm";
import { VersionNavigator } from "./versionNavigator";
import { AttachmentDisplay } from "./attachmentDisplay";
import { MessageActions } from "./messageActions";
import { FollowUpQuestions } from "./followUpQuestions";
import { SearchImages } from "./searchImages";
import { RichLink } from "../ai-elements/richLink";
import { HumanInTheLoopApprovalCard } from "./humanInTheLoopApprovalCard";
import type { MemoryStatus } from "@/types/chat";
import { ToolName } from "@/lib/tools/constants";
import { ToolActivityDisplay } from "./aiThinkingAnimation/toolActivityDisplay";
import { PlanningStep } from "./aiThinkingAnimation/planningStep";
import { CustomEventName } from "@/lib/orchestrator/constants";
import { HUMAN_IN_THE_LOOP_PENDING_ASSISTANT_CONTENT } from "@/hooks/chat/conversationManager";

const USER_URL_REGEX = /(?<![`\[]|(?:\]\())https?:\/\/[^\s<>\[\]`]+/gi;

function trimTrailingUrlPunctuation(rawUrl: string) {
  let url = rawUrl;
  let trailing = "";

  while (url.length > 0) {
    const lastChar = url.at(-1);

    if (!lastChar) {
      break;
    }

    if (/[.,!?;:]/.test(lastChar)) {
      trailing = `${lastChar}${trailing}`;
      url = url.slice(0, -1);
      continue;
    }

    if (lastChar === ")") {
      const openParens = (url.match(/\(/g) || []).length;
      const closeParens = (url.match(/\)/g) || []).length;

      if (closeParens > openParens) {
        trailing = `${lastChar}${trailing}`;
        url = url.slice(0, -1);
        continue;
      }
    }

    break;
  }

  return { url, trailing };
}

function extractUserUrls(text: string) {
  const urls = new Set<string>();

  for (const match of text.matchAll(USER_URL_REGEX)) {
    const { url } = trimTrailingUrlPunctuation(match[0]);

    if (url) {
      urls.add(url);
    }
  }

  return Array.from(urls);
}

interface ChatMessageProps {
  message: Message;
  userName?: string | null;
  onEditMessage?: (messageId: string, newContent: string, attachments?: Attachment[]) => void;
  onRegenerateMessage?: (messageId: string) => void;
  onSendMessage?: (content: string) => void;
  onHumanInTheLoopDecision?: (approved: boolean, response?: string) => void;
  isSharePage?: boolean;
  isLastMessage?: boolean;
  isLoading?: boolean;
  memoryStatus?: MemoryStatus;
}

interface MessageContentSurfaceProps {
  variant: "user" | "assistant";
  message: Message;
  displayedMessage: Message;
  textContent: string;
  renderState: {
    isLoading: boolean;
    isLastMessage: boolean;
    humanInTheLoopPending: boolean;
    hideHumanInTheLoopPlaceholder: boolean;
  };
  memoryStatus?: MemoryStatus;
  humanInTheLoopRequest?: NonNullable<Message["metadata"]>["humanInTheLoopRequest"];
  onHumanInTheLoopDecision?: (approved: boolean, response?: string) => void;
  renderUserTextContent: (text: string) => ReactNode;
}

function MessageContentSurface({
  variant,
  message,
  displayedMessage,
  textContent,
  renderState,
  memoryStatus,
  humanInTheLoopRequest,
  onHumanInTheLoopDecision,
  renderUserTextContent,
}: MessageContentSurfaceProps) {
  const isUser = variant === "user";
  const {
    isLoading,
    isLastMessage,
    humanInTheLoopPending,
    hideHumanInTheLoopPlaceholder,
  } = renderState;

  return (
    <div className={cn(
      "text-[15px] leading-relaxed",
      isUser
        ? "border border-chat-user-bubble-border bg-gradient-to-b from-chat-user-bubble to-chat-user-bubble/80 text-foreground px-4 py-2.5 rounded-[20px] rounded-br-[6px] whitespace-pre-wrap break-words shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.08)]"
        : "w-full min-w-0 text-foreground ml-1"
    )}>
      {!isUser && isLoading && memoryStatus?.toolProgress?.toolName === CustomEventName.PLANNING && (
        <div className="mb-2">
          <PlanningStep
            message={memoryStatus.toolProgress.message || "Planning approach..."}
            plan={(memoryStatus.toolProgress.details as { plan?: string } | undefined)?.plan}
          />
        </div>
      )}

      {!isUser && displayedMessage.thinking && (
        <ThinkingAccordion
          thinking={displayedMessage.thinking}
          isLoading={isLoading}
          durationMs={displayedMessage.metadata?.thinkingDurationMs}
        />
      )}

      {!isUser && displayedMessage.toolActivities && displayedMessage.toolActivities.length > 0 && (
        <div className="mb-2 rounded-xl border border-border/60 bg-gradient-to-b from-card to-muted/60 px-3.5 py-2.5 text-xs shadow-[0_1px_3px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.08)]">
          <ToolActivityDisplay toolActivities={displayedMessage.toolActivities.filter((a) => a.toolName !== ToolName.ASK_USER)} />
        </div>
      )}

      {!isUser && humanInTheLoopRequest && (
        <HumanInTheLoopApprovalCard
          requestKind={humanInTheLoopRequest.requestKind}
          question={humanInTheLoopRequest.question}
          reason={humanInTheLoopRequest.reason}
          title={humanInTheLoopRequest.title}
          context={humanInTheLoopRequest.context}
          options={humanInTheLoopRequest.options}
          recommendation={humanInTheLoopRequest.recommendation}
          toolCalls={humanInTheLoopRequest.toolCalls}
          pending={humanInTheLoopPending}
          isLoading={isLoading}
          onDecision={onHumanInTheLoopDecision}
        />
      )}

      {!hideHumanInTheLoopPlaceholder && textContent ? (
        isUser ? renderUserTextContent(textContent) : <Response>{textContent}</Response>
      ) : !hideHumanInTheLoopPlaceholder && message.content && message.content !== HUMAN_IN_THE_LOOP_PENDING_ASSISTANT_CONTENT ? (
        isUser ? (typeof message.content === 'string' ? renderUserTextContent(message.content) : '') : <Response>{typeof message.content === 'string' ? message.content : ''}</Response>
      ) : humanInTheLoopRequest ? null : isLoading && isLastMessage ? (
        <AIThinkingAnimation
          memoryStatus={memoryStatus}
        />
      ) : null}
    </div>
  );
}

function ChatMessageComponent({ message, userName, onEditMessage, onRegenerateMessage, onSendMessage, onHumanInTheLoopDecision, isSharePage = false, isLastMessage = false, isLoading = false, memoryStatus }: ChatMessageProps) {
  const isUser = message.role === "user";
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const [versionIndex, setVersionIndex] = useState(-1);

  const versions = useMemo(() => message.versions ?? [], [message.versions]);
  const totalVersions = versions.length + 1;
  const currentVersion = versionIndex === -1 ? totalVersions : (totalVersions - 1 - versionIndex);

  const displayedMessage = useMemo<Message>(() => {
    const msg = versionIndex === -1 ? message : (versions[versionIndex] || message);
    return msg;
  }, [versionIndex, message, versions]);

  const displayedContent = displayedMessage.content;
  const displayedAttachments = displayedMessage.attachments;

  const modelName = "AI Assistant"

  const textContent = useMemo(() => {
    const text = extractTextFromContent(displayedContent);
    return text === HUMAN_IN_THE_LOOP_PENDING_ASSISTANT_CONTENT ? "" : text;
  }, [displayedContent]);

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
    setVersionIndex((currentIndex) => {
      if (currentIndex === -1) {
        return versions.length > 0 ? 0 : currentIndex;
      }

      return currentIndex < versions.length - 1 ? currentIndex + 1 : currentIndex;
    });
  }, [versions.length]);

  const handleNextVersion = useCallback(() => {
    setVersionIndex((currentIndex) => {
      if (currentIndex === -1) {
        return currentIndex;
      }

      return currentIndex > 0 ? currentIndex - 1 : -1;
    });
  }, []);

  const isThinking = !textContent && !displayedMessage.content;

  const citations = useMemo(() => {
    if (isUser) return [];

    const allCitations = [];

    if (displayedMessage.metadata?.citations && displayedMessage.metadata.citations.length > 0) {
      allCitations.push(...displayedMessage.metadata.citations);
    }

    if (displayedMessage.metadata?.sources && displayedMessage.metadata.sources.length > 0) {
      const sourcesAsCitations = displayedMessage.metadata.sources.map((source, index) => ({
        id: `source-${source.position || index + 1}`,
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

    const seenUrls = new Set<string>();
    const uniqueCitations = allCitations.filter(citation => {
      if (!citation.url) return true;
      if (seenUrls.has(citation.url)) return false;
      seenUrls.add(citation.url);
      return true;
    });

    return uniqueCitations;
  }, [displayedMessage.metadata, isLastMessage, isUser, memoryStatus]);

  const images = useMemo(() => {
    if (isUser) return [];

    const allImages = [];

    if (displayedMessage.metadata?.images && displayedMessage.metadata.images.length > 0) {
      allImages.push(...displayedMessage.metadata.images);
    }

    const seenUrls = new Set<string>();
    const uniqueImages = allImages.filter(image => {
      if (seenUrls.has(image.url)) return false;
      seenUrls.add(image.url);
      return true;
    });

    return uniqueImages;
  }, [displayedMessage.metadata, isUser]);

  const followUpQuestions = useMemo(() => {
    if (isUser) return [];

    if (displayedMessage.metadata?.followUpQuestions && displayedMessage.metadata.followUpQuestions.length > 0 && !isLoading) {
      if (isLastMessage) {
        return displayedMessage.metadata.followUpQuestions;
      }
    }

    return [];
  }, [displayedMessage.metadata, isLastMessage, isLoading, isUser]);

  const userUrls = useMemo(() => {
    if (!isUser || !textContent) return [];

    return extractUserUrls(textContent);
  }, [isUser, textContent]);

  const humanInTheLoopRequest = !isUser ? displayedMessage.metadata?.humanInTheLoopRequest : undefined;
  const humanInTheLoopPending = displayedMessage.metadata?.humanInTheLoopStatus === "pending" && !!humanInTheLoopRequest;
  const hideHumanInTheLoopPlaceholder = humanInTheLoopPending;

  const renderUserTextContent = useCallback((text: string) => {
    if (!text) return null;

    const nodes: ReactNode[] = [];
    let lastIndex = 0;

    for (const match of text.matchAll(USER_URL_REGEX)) {
      const matchStart = match.index ?? 0;
      const rawUrl = match[0];
      const { url, trailing } = trimTrailingUrlPunctuation(rawUrl);

      if (matchStart > lastIndex) {
        nodes.push(<span key={`text-${matchStart}`}>{text.slice(lastIndex, matchStart)}</span>);
      }

      if (url) {
          nodes.push(
            <a
              key={`url-${matchStart}`}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4 decoration-foreground/25 hover:decoration-foreground transition-colors break-all"
            >
              {url}
            </a>
          );
      }

      if (trailing) {
        nodes.push(<span key={`trail-${matchStart}`}>{trailing}</span>);
      }

      lastIndex = matchStart + rawUrl.length;
    }

    if (lastIndex < text.length) {
      nodes.push(<span key={`text-${lastIndex}`}>{text.slice(lastIndex)}</span>);
    }

    return nodes;
  }, []);

  if (message.role === "system") return null;

  return (
    <div
      className={cn(
        "group relative px-4 py-3 md:py-4 transition-colors w-screen md:w-full",
      )}
    >
      <div className={cn("mx-auto flex w-full max-w-3xl", isUser ? "justify-end" : "justify-start")}>
        <div className={cn("flex min-w-0 gap-3", isUser ? "max-w-[85%] md:max-w-[75%] flex-row-reverse" : "w-full max-w-[90%] md:max-w-[85%]")}>
          <div className={cn("flex min-w-0 flex-col", isUser ? "gap-1 items-end" : "gap-2 w-full items-start")}>
            {!isUser && (
              <MessageHeader
                isUser={false}
                userName={userName}
                modelName={modelName}
                timestamp={displayedMessage.timestamp}
                citations={citations}
              />
            )}

            <AttachmentDisplay
              attachments={displayedAttachments}
              isUser={isUser}
            />

            {!isUser && images.length > 0 && (
              <SearchImages images={images} />
            )}

            {isEditing ? (
              <MessageEditForm
                editText={editText}
                onEditTextChange={setEditText}
                onSubmit={handleEditSubmit}
                onCancel={handleEditCancel}
              />
            ) : (
              <>
                <MessageContentSurface
                  variant={isUser ? "user" : "assistant"}
                  message={message}
                  displayedMessage={displayedMessage}
                  textContent={textContent}
                  renderState={{
                    isLoading,
                    isLastMessage,
                    humanInTheLoopPending,
                    hideHumanInTheLoopPlaceholder,
                  }}
                  memoryStatus={memoryStatus}
                  humanInTheLoopRequest={humanInTheLoopRequest}
                  onHumanInTheLoopDecision={onHumanInTheLoopDecision}
                  renderUserTextContent={renderUserTextContent}
                />

                {isUser && userUrls.length > 0 && (
                  <div className="flex flex-wrap justify-end gap-2 mt-2 w-full">
                    {userUrls.map((url) => (
                      <RichLink key={url} url={url} variant="userMessage" className="w-full sm:w-auto max-w-[280px]" />
                    ))}
                  </div>
                )}

                {!isUser && followUpQuestions.length > 0 && (
                  <FollowUpQuestions
                    questions={followUpQuestions}
                    onQuestionClick={onSendMessage}
                    disabled={isSharePage}
                  />
                )}

                {totalVersions > 1 && (
                  <div className={cn(isUser ? "mr-2" : "ml-1")}>
                    <VersionNavigator
                      currentVersion={currentVersion}
                      totalVersions={totalVersions}
                      historyIndex={versionIndex}
                      historyLength={versions.length}
                      onPrevious={handlePreviousVersion}
                      onNext={handleNextVersion}
                    />
                  </div>
                )}

                {!isSharePage && (
                  <div className={cn(
                    "mt-1 opacity-100 transition-opacity duration-300 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100",
                    isUser ? "pr-2" : "pl-1"
                  )}>
                    <MessageActions
                      context={{ isUser, isEditing, canEdit: !!onEditMessage, isThinking, isLoading }}
                      textContent={textContent}
                      onEditStart={handleEditStart}
                      onRegenerate={onRegenerateMessage && message.id ? () => onRegenerateMessage(message.id!) : undefined}
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
    prevProps.message.thinking !== nextProps.message.thinking ||
    prevProps.message.attachments !== nextProps.message.attachments ||
    prevProps.message.metadata !== nextProps.message.metadata ||
    prevProps.message.toolActivities !== nextProps.message.toolActivities ||
    prevProps.message.versions !== nextProps.message.versions ||
    prevProps.isLastMessage !== nextProps.isLastMessage ||
    prevProps.isLoading !== nextProps.isLoading
  ) {
    return false;
  }

  if (prevProps.message.toolActivities?.length !== nextProps.message.toolActivities?.length) {
    return false;
  }

  const prevLastActivity = prevProps.message.toolActivities?.[prevProps.message.toolActivities.length - 1];
  const nextLastActivity = nextProps.message.toolActivities?.[nextProps.message.toolActivities.length - 1];
  if (prevLastActivity?.status !== nextLastActivity?.status) {
    return false;
  }

  const prevMetadata = prevProps.message.metadata;
  const nextMetadata = nextProps.message.metadata;

  if (
    prevMetadata?.citations?.length !== nextMetadata?.citations?.length ||
    prevMetadata?.sources?.length !== nextMetadata?.sources?.length ||
    prevMetadata?.images?.length !== nextMetadata?.images?.length ||
    prevMetadata?.followUpQuestions?.length !== nextMetadata?.followUpQuestions?.length
  ) {
    return false;
  }

  if (prevProps.isLastMessage && nextProps.isLastMessage) {
    const prevStatus = prevProps.memoryStatus;
    const nextStatus = nextProps.memoryStatus;

    if (prevStatus?.hasMemories !== nextStatus?.hasMemories ||
      prevStatus?.attemptedMemory !== nextStatus?.attemptedMemory ||
      prevStatus?.hasDocuments !== nextStatus?.hasDocuments ||
      prevStatus?.hasImages !== nextStatus?.hasImages ||
      prevStatus?.memoryCount !== nextStatus?.memoryCount ||
      prevStatus?.documentCount !== nextStatus?.documentCount ||
      prevStatus?.imageCount !== nextStatus?.imageCount ||
      prevStatus?.routingDecision !== nextStatus?.routingDecision) {
      return false;
    }

    const prevProgress = prevStatus?.toolProgress;
    const nextProgress = nextStatus?.toolProgress;

    if (prevProgress?.status !== nextProgress?.status ||
      prevProgress?.message !== nextProgress?.message ||
      prevProgress?.details?.status !== nextProgress?.details?.status ||
      prevProgress?.details?.citations?.length !== nextProgress?.details?.citations?.length) {
      return false;
    }
  }

  return true;
});
