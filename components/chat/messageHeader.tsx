import { SourcesSheet } from "./sourcesSheet";
import type { Citation } from "@/types/deepResearch";
import { OpenAIIcon } from "@/components/icons/openaiIcon";

const EMPTY_CITATIONS: Citation[] = [];

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
  citations = EMPTY_CITATIONS,
}: MessageHeaderProps) {
  const hasCitations = !isUser && citations.length > 0;

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        {!isUser && (
          <div className="relative flex size-6 items-center justify-center rounded-full overflow-hidden border border-black/5 dark:border-white/10 bg-white dark:bg-[#1A1A1C] shadow-sm">
            <OpenAIIcon className="size-3 text-black dark:text-primary" />
          </div>
        )}
        <span className="text-[13px] font-semibold tracking-tight text-muted-foreground">
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
