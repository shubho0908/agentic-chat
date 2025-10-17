import { ChatInput } from "@/components/chat/chatInput";
import type { MessageSendHandler } from "@/types/chat";

interface EmptyStateProps {
  onSend: MessageSendHandler;
  isLoading: boolean;
  onStop: () => void;
  onAuthRequired?: () => void;
}

export function EmptyState({ onSend, isLoading, onStop, onAuthRequired }: EmptyStateProps) {
  return (
    <ChatInput
      onSend={onSend}
      isLoading={isLoading}
      onStop={onStop}
      onAuthRequired={onAuthRequired}
      centered
    />
  );
}
