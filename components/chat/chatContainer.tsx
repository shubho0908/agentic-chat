import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import type { Message, Attachment } from "@/lib/schemas/chat";
import { ChatMessage } from "./chatMessage";
import { ScrollArea } from "@/components/ui/scrollArea";
import { cn } from "@/lib/utils";

interface ChatContainerProps {
  messages: Message[];
  isLoading: boolean;
  userName?: string | null;
  onEditMessage?: (messageId: string, newContent: string, attachments?: Attachment[]) => void;
  onRegenerateMessage?: (messageId: string) => void;
  memoryStatus?: {
    hasMemories: boolean;
    hasDocuments: boolean;
    memoryCount: number;
    documentCount: number;
    processingDocuments?: boolean;
    hasImages: boolean;
    imageCount: number;
  };
}

export function ChatContainer({ messages, isLoading, userName, onEditMessage, onRegenerateMessage, memoryStatus }: ChatContainerProps) {
  const lastMessageRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const isSharePage = pathname.startsWith("/share/");

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  function scrollToBottom() {
    lastMessageRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }

  return (
    <ScrollArea className="flex-1">
      <div className={cn("flex flex-col md:pt-0", !isSharePage && "pt-20")}>
        {messages.map((message, index) => (
          <div
            key={message.id || `${message.role}-${index}`}
            ref={index === messages.length - 1 ? lastMessageRef : undefined}
          >
            <ChatMessage 
              message={message} 
              userName={userName} 
              onEdit={onEditMessage} 
              onRegenerate={onRegenerateMessage}
              isLoading={isLoading}
              memoryStatus={index === messages.length - 1 && isLoading ? memoryStatus : undefined}
            />
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

