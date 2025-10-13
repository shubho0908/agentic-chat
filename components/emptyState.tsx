import { ChatInput } from "@/components/chat/chatInput";
import type { MessageSendHandler } from "@/types/chat";

interface EmptyStateProps {
  onSend: MessageSendHandler;
  isLoading: boolean;
  onStop: () => void;
}

export function EmptyState({ onSend, isLoading, onStop }: EmptyStateProps) {
  return (
    <ChatInput
      onSend={onSend}
      isLoading={isLoading}
      onStop={onStop}
      centered
    />
  );
}
