import type { Message } from "@/lib/schemas/chat";

interface MessageHeaderProps {
  isUser: boolean;
  userName?: string | null;
  modelName: string;
  timestamp?: number;
  editHistory?: Message[];
}

function formatTimestamp(timestamp?: number): string {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function MessageHeader({
  isUser,
  userName,
  modelName,
  timestamp,
  editHistory,
}: MessageHeaderProps) {
  const hasEdits = editHistory && editHistory.length > 0;
  
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-semibold">
        {isUser ? (userName || "User") : modelName}
      </span>
      {timestamp && (
        <span className="text-xs text-muted-foreground">
          {formatTimestamp(timestamp)}
        </span>
      )}
      {hasEdits && (
        <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
          edited
        </span>
      )}
    </div>
  );
}
