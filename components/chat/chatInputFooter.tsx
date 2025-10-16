import { Sparkles } from "lucide-react";

interface ChatInputFooterProps {
  centered?: boolean;
}

export function ChatInputFooter({ centered = false }: ChatInputFooterProps) {
  if (centered) {
    return (
      <div className="mt-4 flex items-center justify-center gap-4 text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Sparkles className="size-4" />
          Press <kbd className="rounded-md bg-muted px-2 py-1 text-xs font-semibold">Enter</kbd> to send
        </span>
      </div>
    );
  }

  return (
    <div className="mt-2 flex items-center justify-center gap-4 text-xs text-muted-foreground">
      <span className="flex items-center gap-1">
        <Sparkles className="size-3" />
        AI-powered responses
      </span>
      <span>•</span>
      <span>Press <kbd className="rounded bg-muted px-1.5 py-0.5">Enter</kbd> to send</span>
    </div>
  );
}
