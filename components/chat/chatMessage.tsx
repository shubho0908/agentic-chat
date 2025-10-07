import { memo } from "react";
import type { Message } from "@/lib/schemas/chat";
import { cn } from "@/lib/utils";
import { AIThinkingAnimation } from "./aiThinkingAnimation";
import { OpenAIIcon } from "@/components/icons/openai-icon";
import { OPENAI_MODELS } from "@/constants/openai-models";
import { Response } from "../ai-elements/response";

interface ChatMessageProps {
  message: Message;
  userName?: string | null;
}

function formatTimestamp(timestamp?: number): string {
  if (!timestamp) return "";
  
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function ChatMessageComponent({ message, userName }: ChatMessageProps) {
  const isUser = message.role === "user";
  
  if (message.role === "system") return null;

  const modelName = message.model
    ? OPENAI_MODELS.find((m) => m.id === message.model)?.name || message.model
    : "AI Assistant";

  const userInitial = userName?.charAt(0).toUpperCase() || "U";

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
                "flex size-8 items-center justify-center rounded-full transition-all",
                isUser
                  ? "bg-gradient-to-br from-primary/20 to-primary/10 border border-primary/20 text-sm font-semibold"
                  : "bg-secondary text-secondary-foreground"
              )}
            >
              {isUser ? (
                userInitial
              ) : (
                <OpenAIIcon className="size-4" />
              )}
            </div>
          </div>

          <div className="flex-1 space-y-2 overflow-hidden">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">
                {isUser ? (userName || "User") : modelName}
              </span>
              {message.timestamp && (
                <span className="text-xs text-muted-foreground">
                  {formatTimestamp(message.timestamp)}
                </span>
              )}
            </div>

            <div className="prose prose-sm dark:prose-invert max-w-none">
              {message.content ? (
                <Response>{message.content}</Response>
              ) : (
                <AIThinkingAnimation model={message.model} />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export const ChatMessage = memo(ChatMessageComponent);
