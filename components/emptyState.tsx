"use client";

import { ChatInput } from "@/components/chat/chatInput";

interface EmptyStateProps {
  onSend: (content: string) => Promise<void>;
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
