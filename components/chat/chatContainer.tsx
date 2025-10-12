import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Loader } from "lucide-react";
import type { Message, Attachment } from "@/lib/schemas/chat";
import { ChatMessage } from "./chatMessage";
import { ScrollArea } from "@/components/ui/scrollArea";
import { cn } from "@/lib/utils";
import { MemoryStatus } from "@/hooks/chat/types";

interface ChatContainerProps {
  messages: Message[];
  isLoading: boolean;
  userName?: string | null;
  onEditMessage?: (messageId: string, newContent: string, attachments?: Attachment[]) => void;
  onRegenerateMessage?: (messageId: string) => void;
  memoryStatus?: MemoryStatus
  hasNextPage?: boolean;
  fetchNextPage?: () => void;
  isFetchingNextPage?: boolean;
}

export function ChatContainer({ 
  messages, 
  isLoading, 
  userName, 
  onEditMessage, 
  onRegenerateMessage, 
  memoryStatus,
  hasNextPage,
  fetchNextPage,
  isFetchingNextPage
}: ChatContainerProps) {
  const lastMessageRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const [shouldScrollToBottom, setShouldScrollToBottom] = useState(true);
  const previousScrollHeightRef = useRef<number>(0);
  const pathname = usePathname();
  const isSharePage = pathname?.startsWith("/share/") ?? false;

  useEffect(() => {
    if (shouldScrollToBottom) {
      scrollToBottom();
    }
  }, [messages, isLoading, shouldScrollToBottom]);

  useEffect(() => {
    if (!isFetchingNextPage && previousScrollHeightRef.current > 0) {
      const scrollElement = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement;
      if (scrollElement) {
        const newScrollHeight = scrollElement.scrollHeight;
        const scrollDiff = newScrollHeight - previousScrollHeightRef.current;
        scrollElement.scrollTop = scrollDiff;
        previousScrollHeightRef.current = 0;
      }
    }
  }, [isFetchingNextPage]);

  function scrollToBottom() {
    lastMessageRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }

  const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const scrollTop = target.scrollTop;
    const scrollHeight = target.scrollHeight;
    const clientHeight = target.clientHeight;

    const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
    setShouldScrollToBottom(isNearBottom);

    const isNearTop = scrollTop < 200;
    if (isNearTop && hasNextPage && !isFetchingNextPage && fetchNextPage) {
      previousScrollHeightRef.current = scrollHeight;
      fetchNextPage();
    }
  };

  return (
    <ScrollArea ref={scrollAreaRef} className="flex-1" onScroll={handleScroll}>
      <div className={cn("flex flex-col md:pt-0", !isSharePage && "pt-20")}>
        {isFetchingNextPage && (
          <div className="flex items-center justify-center py-4">
            <Loader className="size-5 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Loading older messages...</span>
          </div>
        )}
        {!isFetchingNextPage && hasNextPage && messages.length > 0 && (
          <div className="flex items-center justify-center py-2">
            <button
              type="button"
              onClick={() => {
                if (fetchNextPage) {
                  const scrollElement = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement;
                  if (scrollElement) {
                    previousScrollHeightRef.current = scrollElement.scrollHeight;
                  }
                  fetchNextPage();
                }
              }}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Load older messages
            </button>
          </div>
        )}
        {messages.map((message, index) => {
          const messageContent = typeof message.content === 'string' ? message.content : '';
          const isGeneratingMessage = isLoading && 
            message.role === "assistant" && 
            messageContent.trim() === '' && 
            message.id?.startsWith("assistant-");
          
          return (
            <div
              key={message.id || `${message.role}-${index}`}
              ref={index === messages.length - 1 ? lastMessageRef : undefined}
            >
              <ChatMessage 
                message={message} 
                userName={userName} 
                onEdit={onEditMessage} 
                onRegenerate={onRegenerateMessage}
                isLoading={isGeneratingMessage || (isLoading && index === messages.length - 1)}
                memoryStatus={isGeneratingMessage || (isLoading && index === messages.length - 1) ? memoryStatus : undefined}
              />
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}

