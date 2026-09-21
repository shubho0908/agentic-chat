import { SourcesSheet } from "./sourcesSheet";

interface Citation {
  id?: string | null;
  source?: string | null;
  author?: string | null;
  year?: string | number | null;
  url?: string | null;
  relevance?: string | null;
  score?: number | null;
  page?: number | null;
}

const EMPTY_CITATIONS: Citation[] = [];

interface MessageMetaProps {
  timestamp?: number;
  citations?: Citation[];
}

function formatTimestamp(timestamp?: number): string {
  if (timestamp == null) return "";
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function MessageMeta({
  timestamp,
  citations = EMPTY_CITATIONS,
}: MessageMetaProps) {
  const hasCitations = citations.length > 0;

  if (timestamp == null && !hasCitations) return null;

  return (
    <div className="flex items-center gap-2">
      {timestamp != null && (
        <span className="text-xs text-muted-foreground">
          {formatTimestamp(timestamp)}
        </span>
      )}
      {hasCitations && <SourcesSheet citations={citations} />}
    </div>
  );
}
