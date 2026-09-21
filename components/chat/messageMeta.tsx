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

function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function MessageTimestamp({ timestamp }: { timestamp?: number }) {
  if (timestamp == null) return null;

  return (
    <span className="text-xs text-muted-foreground">
      {formatTimestamp(timestamp)}
    </span>
  );
}

export function MessageSources({ citations = EMPTY_CITATIONS }: { citations?: Citation[] }) {
  if (citations.length === 0) return null;

  return <SourcesSheet citations={citations} />;
}
