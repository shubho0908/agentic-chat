import type { Attachment, Message } from "@/lib/schemas/chat";
import type { ArtifactMetadata } from "@/types/artifact";
import type { MemoryStatus } from "@/types/chat";

export interface ChatMessageProps {
  message: Message;
  onEditMessage?: (messageId: string, newContent: string, attachments?: Attachment[]) => void;
  onRegenerateMessage?: (messageId: string) => void;
  onSendMessage?: (content: string) => void;
  onHumanInTheLoopDecision?: (approved: boolean, response?: string) => void;
  onOpenArtifact?: (messageId: string, artifact: ArtifactMetadata) => void;
  isSharePage?: boolean;
  isLastMessage?: boolean;
  isLoading?: boolean;
  memoryStatus?: MemoryStatus;
}

export function areChatMessagePropsEqual(prevProps: ChatMessageProps, nextProps: ChatMessageProps): boolean {
  if (
    prevProps.message.id !== nextProps.message.id ||
    prevProps.message.content !== nextProps.message.content ||
    prevProps.message.thinking !== nextProps.message.thinking ||
    prevProps.message.attachments !== nextProps.message.attachments ||
    prevProps.message.metadata !== nextProps.message.metadata ||
    prevProps.message.toolActivities !== nextProps.message.toolActivities ||
    prevProps.message.versions !== nextProps.message.versions ||
    prevProps.onEditMessage !== nextProps.onEditMessage ||
    prevProps.onRegenerateMessage !== nextProps.onRegenerateMessage ||
    prevProps.onSendMessage !== nextProps.onSendMessage ||
    prevProps.onHumanInTheLoopDecision !== nextProps.onHumanInTheLoopDecision ||
    prevProps.onOpenArtifact !== nextProps.onOpenArtifact ||
    prevProps.isSharePage !== nextProps.isSharePage ||
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
    prevMetadata?.pdfs?.length !== nextMetadata?.pdfs?.length ||
    prevMetadata?.followUpQuestions?.length !== nextMetadata?.followUpQuestions?.length ||
    prevMetadata?.artifacts?.length !== nextMetadata?.artifacts?.length
  ) {
    return false;
  }

  if (prevProps.isLastMessage && nextProps.isLastMessage) {
    const prevStatus = prevProps.memoryStatus;
    const nextStatus = nextProps.memoryStatus;

    if (
      prevStatus?.hasMemories !== nextStatus?.hasMemories ||
      prevStatus?.attemptedMemory !== nextStatus?.attemptedMemory ||
      prevStatus?.skippedMemory !== nextStatus?.skippedMemory ||
      prevStatus?.hasDocuments !== nextStatus?.hasDocuments ||
      prevStatus?.hasImages !== nextStatus?.hasImages ||
      prevStatus?.memoryCount !== nextStatus?.memoryCount ||
      prevStatus?.documentCount !== nextStatus?.documentCount ||
      prevStatus?.imageCount !== nextStatus?.imageCount ||
      prevStatus?.routingDecision !== nextStatus?.routingDecision ||
      prevStatus?.degradedContexts?.length !== nextStatus?.degradedContexts?.length
    ) {
      return false;
    }

    const prevProgress = prevStatus?.toolProgress;
    const nextProgress = nextStatus?.toolProgress;

    if (
      prevProgress?.status !== nextProgress?.status ||
      prevProgress?.message !== nextProgress?.message ||
      prevProgress?.details?.status !== nextProgress?.details?.status ||
      prevProgress?.details?.citations?.length !== nextProgress?.details?.citations?.length
    ) {
      return false;
    }
  }

  return true;
}
