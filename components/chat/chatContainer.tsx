import { useEffect, useRef } from "react";
import type { Message } from "@/lib/schemas/chat";
import { ChatMessage } from "./chatMessage";
import { ScrollArea } from "@/components/ui/scrollArea";

interface ChatContainerProps {
  messages: Message[];
  isLoading: boolean;
  userName?: string | null;
}

export function ChatContainer({ messages, isLoading, userName }: ChatContainerProps) {
  const lastMessageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  function scrollToBottom() {
    lastMessageRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }

  return (
    <ScrollArea className="flex-1">
      <div className="flex flex-col pt-20 md:pt-0">
        {messages.map((message, index) => (
          <div
            key={message.id || `${message.role}-${index}`}
            ref={index === messages.length - 1 ? lastMessageRef : undefined}
          >
            <ChatMessage message={message} userName={userName} />
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

