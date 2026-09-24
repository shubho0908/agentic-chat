"use client";

import { memo, useId, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  Loader,
} from "lucide-react";
import type { ToolActivity } from "@/lib/schemas/chat";
import { ToolStatus } from "@/lib/schemas/chat";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  formatToolArgsPreview,
  formatToolResultPreview,
  getToolActionLabel,
  getToolFamily,
  getToolKeyArg,
  getToolResultMeta,
  getToolRowLabel,
  getToolSources,
  type ToolMetaTone,
  type ToolPreview,
} from "./toolActivityMeta";
import { ToolIcon } from "./toolIcons";

const INLINE_SOURCE_LIMIT = 4;

const META_TONE_CLASS: Record<ToolMetaTone, string> = {
  neutral: "text-muted-foreground",
  warning: "text-amber-500/80",
  error: "text-destructive/80",
};

function getStatusLabel(status: string): string {
  if (status === ToolStatus.Calling) return "Running";
  if (status === ToolStatus.Completed) return "Completed";
  return "Failed";
}

function StatusIndicator({ status }: { status: string }) {
  if (status === ToolStatus.Calling) {
    return <Loader aria-hidden className="size-3 shrink-0 animate-spin text-muted-foreground" />;
  }
  if (status === ToolStatus.Completed) {
    return <CheckCircle2 aria-hidden className="size-3 shrink-0 text-muted-foreground/60" />;
  }
  return <AlertCircle aria-hidden className="size-3 shrink-0 text-destructive/80" />;
}

function SourcesSheet({ sources }: { sources: { domain: string; url: string }[] }) {
  const hidden = sources.length - INLINE_SOURCE_LIMIT;

  return (
    <Sheet>
      <SheetTrigger asChild>
        <button
          type="button"
          className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          +{hidden} more
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{sources.length} sources</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-2 overflow-y-auto px-4 pb-4">
          {sources.map((source, index) => (
            <a
              key={`${source.domain}-${index}`}
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-2 rounded-md border border-border/50 px-3 py-2 text-sm transition-colors hover:bg-muted/60"
            >
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{index + 1}</span>
              <span className="min-w-0 flex-1 truncate text-foreground/90">{source.domain}</span>
              <ExternalLink
                aria-hidden
                className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
              />
            </a>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function PreviewBlock({
  label,
  preview,
  tone,
}: {
  label: string;
  preview: ToolPreview;
  tone: ToolMetaTone;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-medium tracking-wide text-muted-foreground/70 uppercase">
        {label}
      </span>
      <pre
        className={cn(
          "font-mono text-[10.5px] leading-relaxed break-words whitespace-pre-wrap",
          tone === "error" ? "text-destructive/80" : "text-muted-foreground",
        )}
      >
        {preview.text}
      </pre>
      {preview.truncated && (
        <span className="text-[10px] text-muted-foreground/60">Preview truncated</span>
      )}
    </div>
  );
}

interface ToolCallRowProps {
  activity: ToolActivity;
  /** Rows inside a grouped run drop the toolkit prefix; lone calls keep it. */
  showFamily?: boolean;
}

export const ToolCallRow = memo(function ToolCallRow({
  activity,
  showFamily = true,
}: ToolCallRowProps) {
  const [isOpen, setIsOpen] = useState(false);
  const panelId = useId();

  const family = getToolFamily(activity.toolName);
  // `getToolRowLabel` already collapses "Read webpage · Read webpage" style
  // duplicates that would otherwise repeat built-in tool labels.
  const rowLabel = showFamily
    ? getToolRowLabel(activity.toolName)
    : getToolActionLabel(activity.toolName);
  const keyArg = getToolKeyArg(activity);
  const meta = getToolResultMeta(activity);
  const sources = getToolSources(activity);
  const inlineSources = sources.slice(0, INLINE_SOURCE_LIMIT);
  const hasMoreSources = sources.length > INLINE_SOURCE_LIMIT;
  const isError = activity.status === ToolStatus.Error;

  const argsPreview = isOpen ? formatToolArgsPreview(activity.args) : null;
  const resultPreview = isOpen ? formatToolResultPreview(activity) : null;

  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        aria-controls={panelId}
        // Stable hook for the /message-preview review harness.
        data-tool-activity-row={activity.status}
        className="flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-1 text-left transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <ToolIcon icon={family.icon} className="size-3.5 shrink-0 text-muted-foreground" />

        <span className={cn("truncate text-[12px] font-medium text-foreground/80", keyArg ? "max-w-[42%] shrink-0" : "min-w-0 flex-1")}>{rowLabel}</span>

        {keyArg && (
          <span
            title={keyArg.text}
            className={cn(
              "min-w-0 flex-1 truncate text-muted-foreground",
              keyArg.isIdentifier ? "font-mono text-[10.5px]" : "text-[11px]",
            )}
          >
            {keyArg.text}
          </span>
        )}

        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          {meta && <span className={cn("text-[10px]", META_TONE_CLASS[meta.tone])}>{meta.label}</span>}
          <span className="sr-only">{getStatusLabel(activity.status)}</span>
          <StatusIndicator status={activity.status} />
          <ChevronDown
            aria-hidden
            className={cn(
              "size-3 text-muted-foreground/50 transition-transform duration-200",
              isOpen && "rotate-180",
            )}
          />
        </span>
      </button>

      {sources.length > 0 && (
        <div className="ml-6 flex flex-wrap items-center gap-1 py-1">
          {inlineSources.map((source, index) => (
            <a
              key={`${source.domain}-${index}`}
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              {source.domain}
            </a>
          ))}
          {hasMoreSources && <SourcesSheet sources={sources} />}
        </div>
      )}

      {isOpen && (
        <div
          id={panelId}
          className="animate-in fade-in-0 slide-in-from-top-1 mb-1.5 ml-6 flex flex-col gap-2.5 rounded-lg border border-border/50 bg-muted/25 px-2.5 py-2 duration-150"
        >
          {keyArg?.href && (
            <a
              href={keyArg.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-fit items-center gap-1.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              Open {keyArg.text}
              <ExternalLink aria-hidden className="size-3" />
            </a>
          )}
          {argsPreview && <PreviewBlock label="Arguments" preview={argsPreview} tone="neutral" />}
          {resultPreview && (
            <PreviewBlock
              label={isError ? "Error" : "Result"}
              preview={resultPreview}
              tone={isError ? "error" : "neutral"}
            />
          )}
        </div>
      )}
    </div>
  );
});
