"use client";

import { Brain } from "lucide-react";
import { useEffect, useRef } from "react";
import { Response } from "@/components/ai-elements/response";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface ThinkingAccordionProps {
  thinking: string;
  isLoading?: boolean;
  durationMs?: number;
}

const STICKY_BOTTOM_THRESHOLD_PX = 24;

function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return remaining > 0 ? `${minutes}m ${remaining}s` : `${minutes}m`;
}

export function ThinkingAccordion({ thinking, isLoading = false, durationMs }: ThinkingAccordionProps) {
  const label = isLoading
    ? "Thinking..."
    : `Thought for ${durationMs ? formatDuration(durationMs) : "a few seconds"}`;

  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const handleScroll = () => {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      stickToBottomRef.current = distanceFromBottom <= STICKY_BOTTOM_THRESHOLD_PX;
    };

    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (!isLoading) return;
    const el = scrollRef.current;
    if (!el) return;
    if (stickToBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [thinking, isLoading]);

  return (
    <Accordion type="single" collapsible defaultValue="thinking">
      <AccordionItem value="thinking" className="border-none">
        <AccordionTrigger className="py-1.5 text-xs text-muted-foreground hover:no-underline justify-start gap-2">
          <span className="flex items-center gap-1.5">
            <Brain className="size-3.5" />
            {label}
          </span>
        </AccordionTrigger>
        <AccordionContent className="pb-3 pt-0">
          <div className="relative">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-4 bg-gradient-to-b from-background to-transparent z-10" />
            <div
              ref={scrollRef}
              className="text-[13px] leading-relaxed max-h-72 overflow-y-auto scrollbar-hide opacity-70 py-2"
            >
              {thinking ? <Response>{thinking}</Response> : (isLoading ? "Reasoning..." : "")}
            </div>
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-4 bg-gradient-to-t from-background to-transparent z-10" />
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
