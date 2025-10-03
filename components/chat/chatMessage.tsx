import { memo } from "react";
import { User, Bot } from "lucide-react";
import type { Message } from "@/lib/schemas/chat";
import { cn } from "@/lib/utils";
import { AIThinkingAnimation } from "./aiThinkingAnimation";

interface ChatMessageProps {
  message: Message;
}

function formatTimestamp(timestamp?: number): string {
  if (!timestamp) return "";
  
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function ChatMessageComponent({ message }: ChatMessageProps) {
  const isUser = message.role === "user";
  
  if (message.role === "system") return null;

  return (
    <div
      className={cn(
        "group relative px-4 py-8 transition-colors",
        !isUser && "bg-muted/30"
      )}
    >
      <div className="mx-auto max-w-3xl">
        <div className="flex gap-4">
          <div className="flex-shrink-0">
            <div
              className={cn(
                "flex size-8 items-center justify-center rounded-full ring-2 ring-offset-2 transition-all",
                isUser
                  ? "bg-gradient-to-br from-blue-500 to-blue-600 ring-blue-200 dark:ring-blue-900"
                  : "bg-gradient-to-br from-purple-500 to-purple-600 ring-purple-200 dark:ring-purple-900"
              )}
            >
              {isUser ? (
                <User className="size-4 text-white" />
              ) : (
                <Bot className="size-4 text-white" />
              )}
            </div>
          </div>

          <div className="flex-1 space-y-2 overflow-hidden">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">
                {isUser ? "You" : "AI Assistant"}
              </span>
              {message.timestamp && (
                <span className="text-xs text-muted-foreground">
                  {formatTimestamp(message.timestamp)}
                </span>
              )}
            </div>

            <div className="prose prose-sm dark:prose-invert max-w-none">
              {message.content ? (
                <p className="m-0 whitespace-pre-wrap break-words leading-relaxed">
                  {message.content}
                </p>
              ) : (
                <AIThinkingAnimation />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export const ChatMessage = memo(ChatMessageComponent);
