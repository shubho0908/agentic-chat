"use client";

import { FileCode2 } from "lucide-react";
import type { ArtifactMetadata } from "@/types/artifact";

interface ArtifactButtonsProps {
  artifacts: ArtifactMetadata[];
  messageId?: string;
  onOpenArtifact?: (messageId: string, artifact: ArtifactMetadata) => void;
}

export function ArtifactButtons({
  artifacts,
  messageId,
  onOpenArtifact,
}: ArtifactButtonsProps) {
  if (!messageId || artifacts.length === 0 || !onOpenArtifact) return null;

  return (
    <div className="ml-1 flex w-full max-w-full flex-wrap gap-2">
      {artifacts.map((artifact) => (
        <button
          key={artifact.id}
          type="button"
          className="group flex max-w-full cursor-pointer items-center gap-2.5 rounded-xl border border-border/60 bg-gradient-to-b from-card to-card/80 px-3.5 py-2.5 shadow-[0_1px_3px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.06)] transition-all duration-150 hover:shadow-[0_2px_6px_rgba(0,0,0,0.12),0_1px_3px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.08)] hover:border-border active:shadow-[inset_0_1px_3px_rgba(0,0,0,0.1)] active:translate-y-[0.5px] dark:from-zinc-800/90 dark:to-zinc-900/90 dark:border-zinc-700/60 dark:shadow-[0_1px_3px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.04)] dark:hover:shadow-[0_2px_6px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.06)] dark:hover:border-zinc-600/80"
          onClick={() => onOpenArtifact(messageId, artifact)}
          title={artifact.title}
        >
          <FileCode2 className="size-4 shrink-0 text-muted-foreground group-hover:text-foreground transition-colors" />
          <span className="truncate text-sm font-medium">{artifact.title}</span>
          <span className="shrink-0 rounded-md bg-muted/60 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">{artifact.type}</span>
        </button>
      ))}
    </div>
  );
}
