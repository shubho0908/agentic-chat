"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, BookOpen, Loader } from "lucide-react";
import type { ToolActivity } from "@/lib/schemas/chat";
import { ToolName } from "@/lib/tools/constants";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { summarizeToolRun } from "./toolActivityMeta";
import { ToolCallRow } from "./toolCallRow";
import { ToolIcon } from "./toolIcons";

const RUN_ITEM_VALUE = "tool-run";

interface ToolActivityDisplayProps {
  toolActivities: ToolActivity[];
}

/** A tool run reads as one collapsed line ("Gmail · 22 tool calls"), expands into
 *  the individual calls, and each call expands into its args/result payload.
 *
 *  While calls are in flight the run stays open, and it folds away when the run
 *  finishes — unless the reader opened or closed it by hand during that run. */
export const ToolActivityDisplay = memo(function ToolActivityDisplay({
  toolActivities,
}: ToolActivityDisplayProps) {
  const visible = useMemo(
    () => toolActivities.filter((activity) => activity.toolName !== ToolName.ASK_USER),
    [toolActivities],
  );

  const summary = useMemo(() => summarizeToolRun(visible), [visible]);
  const isLive = summary.running > 0;
  const [isOpen, setIsOpen] = useState(isLive);
  const wasLiveRef = useRef(isLive);
  const toggledByReaderRef = useRef(false);

  useEffect(() => {
    const wasLive = wasLiveRef.current;
    wasLiveRef.current = isLive;
    if (wasLive === isLive) return;

    if (isLive) {
      // A fresh run takes back control so progress is visible again.
      toggledByReaderRef.current = false;
      setIsOpen(true);
      return;
    }

    if (!toggledByReaderRef.current) {
      setIsOpen(false);
    }
  }, [isLive]);

  if (visible.length === 0) return null;

  const handleValueChange = (value: string) => {
    toggledByReaderRef.current = true;
    setIsOpen(value === RUN_ITEM_VALUE);
  };

  const primaryLabel = isLive && summary.activeLabel ? summary.activeLabel : summary.countLabel;

  return (
    <Accordion
      type="single"
      collapsible
      value={isOpen ? RUN_ITEM_VALUE : ""}
      onValueChange={handleValueChange}
    >
      <AccordionItem value={RUN_ITEM_VALUE} className="border-none">
        <AccordionTrigger
          // Stable hook for the /message-preview review harness.
          data-tool-activity-summary
          className="items-center gap-2 rounded-lg px-2 py-1 text-left text-sm font-medium transition-colors hover:bg-muted/40 hover:no-underline focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50 focus-visible:outline-none [&>svg]:size-3.5 [&>svg]:text-muted-foreground/50"
        >
          <span className="flex min-w-0 flex-1 items-center gap-2">
            {isLive ? (
              <Loader aria-hidden className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
            ) : (
              <ToolIcon icon={summary.icon} className="size-3.5 shrink-0 text-muted-foreground" />
            )}

            <span className="flex min-w-0 items-baseline gap-1.5 truncate text-[12px]">
              <span className="font-medium text-foreground/80">{summary.title}</span>
              <span aria-hidden className="text-muted-foreground/40">·</span>
              <span className="truncate text-[11px] text-muted-foreground">{primaryLabel}</span>
            </span>

            <span className="ml-auto flex shrink-0 items-center gap-2 pr-1">
              {summary.progressLabel && (
                <span className="text-[10px] tabular-nums text-muted-foreground/70">
                  {summary.progressLabel}
                </span>
              )}
              {summary.sourceCount > 0 && (
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <BookOpen aria-hidden className="size-3" />
                  {summary.sourceCount} {summary.sourceCount === 1 ? "source" : "sources"}
                </span>
              )}
              {summary.hasFailures && (
                <span className="flex items-center gap-1 text-[10px] text-destructive/80">
                  <AlertCircle aria-hidden className="size-3" />
                  {summary.failed} failed
                </span>
              )}
            </span>
          </span>
        </AccordionTrigger>

        <AccordionContent className="pt-1 pb-1.5">
          <ol className="max-h-72 overflow-y-auto overscroll-contain pl-3">
            {visible.map((activity, index) => {
              const isLast = index === visible.length - 1;

              return (
                <li
                  key={`${activity.toolCallId}-${index}`}
                  className="relative pl-3"
                >
                  <span
                    aria-hidden
                    className="absolute top-0 left-0 h-3 w-2.5 rounded-bl-[6px] border-b border-l border-foreground/20 dark:border-foreground/25"
                  />
                  {!isLast && (
                    <span
                      aria-hidden
                      className="absolute top-3 bottom-0 left-0 border-l border-foreground/20 dark:border-foreground/25"
                    />
                  )}
                  <ToolCallRow activity={activity} />
                </li>
              );
            })}
          </ol>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
});
