import { SourcesSheet } from "./sourcesSheet";
import type { Citation } from "@/types/deep-research";

interface MessageHeaderProps {
  isUser: boolean;
  userName?: string | null;
  modelName: string;
  timestamp?: number;
  citations?: Citation[];
}

function formatTimestamp(timestamp?: number): string {
  if (timestamp == null) return "";
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function MessageHeader({
  isUser,
  userName,
  modelName,
  timestamp,
  citations = [],
}: MessageHeaderProps) {
  const hasCitations = !isUser && citations.length > 0;

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold">
          {isUser ? (userName ?? "User") : modelName}
        </span>
        {timestamp != null && (
          <span className="text-xs text-muted-foreground">
            {formatTimestamp(timestamp)}
          </span>
        )}
      </div>
      
      {hasCitations && (
        <SourcesSheet citations={citations} />
      )}
    </div>
  );
}
