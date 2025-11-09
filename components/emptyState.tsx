import { ChatInput } from "@/components/chat/chatInput";
import type { MessageSendHandler, TokenUsage } from "@/types/chat";

interface EmptyStateProps {
  onSend: MessageSendHandler;
  isLoading: boolean;
  onStop: () => void;
  onAuthRequired?: () => void;
  tokenUsage?: TokenUsage;
}

export function EmptyState({ onSend, isLoading, onStop, onAuthRequired, tokenUsage }: EmptyStateProps) {
  return (
    <ChatInput
      onSend={onSend}
      isLoading={isLoading}
      onStop={onStop}
      onAuthRequired={onAuthRequired}
      tokenUsage={tokenUsage}
      conversationId={null}
      centered
    />
  );
}
