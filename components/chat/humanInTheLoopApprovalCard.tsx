"use client";

import { useCallback, useRef, useState, type ReactNode } from "react"
import { Check, ChevronDown, Info, MessageCircleQuestion, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HumanInTheLoopRequestKind } from "@/lib/tools/constants";
import { cn } from "@/lib/utils";
import { getToolFamily, getToolRowLabel } from "./aiThinkingAnimation/toolActivityMeta";
import { ToolIcon } from "./aiThinkingAnimation/toolIcons";
import { InlineMarkdown } from "@/components/ai-elements/inlineMarkdown";

interface HumanInTheLoopToolCall {
  id?: string;
  name: string;
  args?: Record<string, unknown>;
}

interface DecisionOption {
  label: string;
  description: string;
}

interface HumanInTheLoopApprovalCardProps {
  requestKind?: string;
  question?: string;
  reason?: string;
  title?: string;
  context?: string;
  options?: DecisionOption[];
  recommendation?: string;
  toolCalls?: HumanInTheLoopToolCall[];
  pending: boolean;
  isLoading: boolean;
  onDecision?: (approved: boolean, response?: string) => void;
}

const OPTION_LETTERS = ["A", "B", "C", "D", "E", "F"];

const PILL_CLASS = "h-11 rounded-full px-4 text-sm sm:h-7 sm:px-3 sm:text-[13px]";

function formatArgKey(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function isLongValue(value: unknown): boolean {
  if (typeof value === "string") return value.length > 120 || value.includes("\n");
  return false;
}

function ClampedValue({ value, mono = false }: { value: string; mono?: boolean }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mt-1">
      <pre
        className={cn(
          "max-h-40 overflow-hidden rounded bg-muted/80 p-2 text-xs leading-relaxed whitespace-pre-wrap break-words",
          mono && "font-mono",
          expanded && "max-h-[60dvh] overflow-auto",
        )}
      >
        {value}
      </pre>
      {isLongValue(value) ? (
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          className="mt-1 text-[11px] font-medium text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          {expanded ? "Show less" : "Show all"}
          <ChevronDown
            className={cn(
              "ml-0.5 inline size-3 align-[-0.125em] transition-transform duration-200",
              expanded && "rotate-180",
            )}
            aria-hidden="true"
          />
        </button>
      ) : null}
    </div>
  );
}

function ArgValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span className="text-muted-foreground/60 italic">empty</span>;
  if (typeof value === "boolean") return <span className="font-mono text-xs">{value ? "true" : "false"}</span>;
  if (typeof value === "number") return <span className="font-mono text-xs">{value}</span>;

  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-muted-foreground/60 italic">none</span>;
    return (
      <span className="flex flex-wrap gap-1">
        {value.map((item, i) => (
          <span key={i} className="inline-block rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
            {typeof item === "string" ? item : JSON.stringify(item)}
          </span>
        ))}
      </span>
    );
  }

  if (typeof value === "object") {
    return <ClampedValue value={JSON.stringify(value, null, 2)} mono />;
  }

  const str = String(value);
  if (isLongValue(str)) return <ClampedValue value={str} />;

  return <span className="break-words">{str}</span>;
}

function GlideList({ children, className }: { children: ReactNode; className?: string }) {
  const listRef = useRef<HTMLDivElement>(null);
  const [bar, setBar] = useState<{ top: number; height: number } | null>(null);

  const track = useCallback((target: EventTarget | null) => {
    const container = listRef.current;
    const row = target instanceof Element ? target.closest<HTMLElement>("[data-glide-row]") : null;
    if (!container || !row || !container.contains(row)) return;

    const next = { top: row.offsetTop, height: row.offsetHeight };
    setBar((current) => (current && current.top === next.top && current.height === next.height ? current : next));
  }, []);

  const clearUnlessFocusStaysInside = useCallback((event: React.FocusEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
    setBar(null);
  }, []);

  return (
    <div
      ref={listRef}
      className={cn("relative flex flex-col gap-0.5", className)}
      onMouseOver={(event) => track(event.target)}
      onMouseLeave={() => setBar(null)}
      onFocus={(event) => track(event.target)}
      onBlurCapture={clearUnlessFocusStaysInside}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 rounded-lg bg-muted/70 transition-[top,height,opacity] duration-200 ease-out"
        style={{ top: bar?.top ?? 0, height: bar?.height ?? 0, opacity: bar ? 1 : 0 }}
      />
      {children}
    </div>
  );
}

function RadioMark({ selected }: { selected: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors duration-200",
        selected ? "border-primary bg-primary" : "border-ring/50",
      )}
    >
      <span
        className="size-1.5 rounded-full bg-primary-foreground transition-transform duration-200"
        style={{ transform: selected ? "scale(1)" : "scale(0)" }}
      />
    </span>
  );
}

function StatusChip({
  tone,
  icon,
  children,
}: {
  tone: "warning" | "neutral";
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium",
        tone === "warning"
          ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
          : "bg-muted text-muted-foreground",
      )}
    >
      {icon}
      {children}
    </span>
  );
}

function Card({
  chip,
  heading,
  context,
  reason,
  children,
  footer,
}: {
  chip: ReactNode;
  heading: string;
  context?: string;
  reason?: string;
  children?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="animate-in fade-in-0 slide-in-from-bottom-1 w-full max-w-xl overflow-hidden rounded-xl border border-border/60 bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04),0_14px_32px_-20px_rgba(0,0,0,0.28)] duration-300">
      <div className="space-y-2.5 px-3 py-2.5 sm:px-3.5 sm:py-3">
        <div>
          {chip}
          <h3 className="mt-1.5 text-sm leading-snug font-medium text-foreground break-words">
            <InlineMarkdown content={heading} />
          </h3>
          {context ? (
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground break-words">
              <InlineMarkdown content={context} />
            </p>
          ) : null}
          {reason ? (
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground/80 italic break-words">
              <InlineMarkdown content={reason} />
            </p>
          ) : null}
        </div>
        {children}
      </div>
      {footer}
    </div>
  );
}

function CardFooter({ hint, children }: { hint?: ReactNode; children: ReactNode }) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 border-t border-border/60 px-3 py-2",
        hint ? "justify-between" : "justify-end",
      )}
    >
      {hint && <span className="text-[11px] font-medium tabular-nums text-muted-foreground">{hint}</span>}
      <div className="flex items-center gap-1.5">{children}</div>
    </div>
  );
}

function ToolCallBlock({ toolCall }: { toolCall: HumanInTheLoopToolCall }) {
  const family = getToolFamily(toolCall.name);
  const entries = Object.entries(toolCall.args ?? {}).filter(
    ([, value]) => value !== undefined && value !== null && value !== "",
  );

  return (
    <div className="overflow-hidden rounded-lg border border-border/50 bg-muted/30">
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        <ToolIcon icon={family.icon} className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate text-[13px] font-medium text-foreground">{getToolRowLabel(toolCall.name)}</span>
      </div>

      {entries.length > 0 && (
        <div className="space-y-1.5 border-t border-border/50 px-2.5 py-2">
          {entries.map(([key, value]) => (
            <div key={key} className="grid grid-cols-[5rem_minmax(0,1fr)] items-start gap-2">
              <span className="pt-px text-[11px] leading-5 text-muted-foreground">{formatArgKey(key)}</span>
              <span className="min-w-0 text-[13px] leading-5 text-foreground">
                <ArgValue value={value} />
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SuggestionNote({ recommendation }: { recommendation: string }) {
  const note = recommendation.trim().replace(/^\(?option\s+[A-F]\)?\s*[:.\u2013\u2014-]?\s*/i, "");
  if (!note) return null;

  return (
    <div className="flex items-start gap-2 rounded-lg bg-muted/50 px-2.5 py-2">
      <Info className="mt-px size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <InlineMarkdown content={note} className="text-xs leading-relaxed text-muted-foreground break-words" />
    </div>
  );
}

function ApprovalCard({
  toolCalls,
  pending,
  isLoading,
  onDecision,
}: {
  toolCalls: HumanInTheLoopToolCall[];
  pending: boolean;
  isLoading: boolean;
  onDecision?: (approved: boolean, response?: string) => void;
}) {
  const interactive = pending && Boolean(onDecision);
  const count = toolCalls.length;

  return (
    <Card
      chip={
        <StatusChip tone="warning" icon={<ShieldAlert className="size-3" aria-hidden="true" />}>
          Approval required
        </StatusChip>
      }
      heading="Approve these actions?"
      context={
        count > 1
          ? `All ${count} actions run as soon as you approve.`
          : "This action runs as soon as you approve."
      }
      footer={
        interactive ? (
          <CardFooter hint={count > 0 ? `${count} ${count === 1 ? "action" : "actions"}` : undefined}>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isLoading}
              onClick={() => onDecision?.(false)}
              className={cn(PILL_CLASS, "text-destructive hover:bg-destructive/10 hover:text-destructive")}
            >
              Deny
            </Button>
            <Button type="button" size="sm" disabled={isLoading} onClick={() => onDecision?.(true)} className={PILL_CLASS}>
              {count > 1 ? "Approve all" : "Approve"}
            </Button>
          </CardFooter>
        ) : undefined
      }
    >
      <div className="space-y-1.5">
        {toolCalls.map((toolCall, index) => (
          <ToolCallBlock key={toolCall.id ?? index} toolCall={toolCall} />
        ))}
      </div>
    </Card>
  );
}

function DecisionCard({
  question,
  reason,
  title,
  context,
  options,
  recommendation,
  pending,
  isLoading,
  onDecision,
}: {
  question?: string;
  reason?: string;
  title?: string;
  context?: string;
  options: DecisionOption[];
  recommendation?: string;
  pending: boolean;
  isLoading: boolean;
  onDecision?: (approved: boolean, response?: string) => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [custom, setCustom] = useState("");

  const interactive = pending && Boolean(onDecision);
  const locked = !interactive || isLoading;
  const trimmedCustom = custom.trim();

  const recommendedIndex = (() => {
    if (!recommendation) return -1;
    const text = recommendation.trim();
    if (!text) return -1;

    const letterMatch = text.match(/^[\s(]*(?:option\s+)?([A-F])(?=[\s.:)\-,])/i);
    if (letterMatch) {
      const letterIdx = OPTION_LETTERS.indexOf(letterMatch[1].toUpperCase());
      if (letterIdx >= 0 && letterIdx < options.length) return letterIdx;
    }

    const lower = text.toLowerCase();
    let bestIdx = -1;
    let bestLen = 0;
    options.forEach((option, idx) => {
      const label = option.label.trim().toLowerCase();
      if (label && lower.includes(label) && label.length > bestLen) {
        bestIdx = idx;
        bestLen = label.length;
      }
    });
    return bestIdx;
  })();

  const canSubmit = selected !== null || trimmedCustom.length > 0;

  const submit = () => {
    if (locked || !canSubmit) return;
    if (trimmedCustom) {
      onDecision?.(true, trimmedCustom);
      return;
    }
    if (selected !== null) {
      onDecision?.(true, `${OPTION_LETTERS[selected]}. ${options[selected].label}`);
    }
  };

  return (
    <Card
      chip={
        <StatusChip tone="neutral" icon={<MessageCircleQuestion className="size-3" aria-hidden="true" />}>
          Decision needed
        </StatusChip>
      }
      heading={(question ?? "").trim() || (title ?? "").trim() || "How would you like to proceed?"}
      context={context}
      reason={reason}
      footer={
        interactive ? (
          <CardFooter>
            <Button type="button" size="sm" disabled={isLoading || !canSubmit} onClick={submit} className={PILL_CLASS}>
              Submit answer
            </Button>
          </CardFooter>
        ) : undefined
      }
    >
      <GlideList>
        {options.map((option, index) => {
          const isSelected = selected === index && !trimmedCustom;
          const isRecommended = index === recommendedIndex;

          return (
            <button
              key={`${option.label}:${option.description}`}
              type="button"
              data-glide-row
              aria-pressed={isSelected}
              disabled={locked}
              onClick={() => {
                setSelected(index);
                setCustom("");
              }}
              className={cn(
                "relative z-10 flex min-h-11 w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left transition-colors duration-100 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none sm:min-h-0 sm:py-1.5",
                locked && "cursor-not-allowed opacity-60",
              )}
            >
              <span className="mt-0.5">
                <RadioMark selected={isSelected} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-1.5">
                  <InlineMarkdown content={option.label} className="text-[13px] leading-tight font-medium text-foreground" />
                  {isRecommended && (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-px text-[10px] font-medium text-primary">
                      <Check className="size-2.5" aria-hidden="true" />
                      Suggested
                    </span>
                  )}
                </span>
                {option.description ? (
                  <InlineMarkdown content={option.description} className="mt-0.5 block text-xs leading-relaxed text-muted-foreground" />
                ) : null}
              </span>
            </button>
          );
        })}

        <label
          data-glide-row
          className={cn("relative z-10 flex min-h-11 items-center gap-2.5 rounded-lg px-2 py-2 sm:min-h-0 sm:py-1.5", locked && "opacity-60")}
        >
          <RadioMark selected={trimmedCustom.length > 0} />
          <input
            value={custom}
            disabled={locked}
            aria-label="Custom answer"
            placeholder="Something else…"
            onChange={(event) => {
              setCustom(event.target.value);
              setSelected(null);
            }}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (event.key === "Enter") {
                event.preventDefault();
                submit();
              }
            }}
            className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground/70 disabled:cursor-not-allowed"
          />
        </label>
      </GlideList>

      {recommendation && <SuggestionNote recommendation={recommendation} />}
    </Card>
  );
}

function AskUserCard({
  question,
  reason,
  title,
  context,
  pending,
  isLoading,
  onDecision,
}: {
  question?: string;
  reason?: string;
  title?: string;
  context?: string;
  pending: boolean;
  isLoading: boolean;
  onDecision?: (approved: boolean, response?: string) => void;
}) {
  const focusAnswerInput = useCallback((input: HTMLInputElement | null) => {
    input?.focus({ preventScroll: true });
  }, []);
  const [answer, setAnswer] = useState("");

  const interactive = pending && Boolean(onDecision);
  const trimmed = answer.trim();

  const submit = () => {
    if (!interactive || isLoading || !trimmed) return;
    onDecision?.(true, trimmed);
  };

  return (
    <Card
      chip={
        <StatusChip tone="neutral" icon={<MessageCircleQuestion className="size-3" aria-hidden="true" />}>
          Input needed
        </StatusChip>
      }
      heading={(question ?? "").trim() || (title ?? "").trim() || "Can you clarify how to proceed?"}
      context={context}
      reason={reason}
      footer={
        interactive ? (
          <CardFooter>
            <Button type="button" size="sm" disabled={isLoading || !trimmed} onClick={submit} className={PILL_CLASS}>
              Send
            </Button>
          </CardFooter>
        ) : undefined
      }
    >
      <div
        className={cn(
          "flex min-h-11 items-center rounded-lg bg-muted/50 px-2.5 py-1.5 transition-shadow focus-within:ring-2 focus-within:ring-ring/40 sm:min-h-0",
          (!interactive || isLoading) && "opacity-60",
        )}
      >
        <input
          ref={interactive ? focusAnswerInput : null}
          value={answer}
          disabled={!interactive || isLoading}
          aria-label="Clarification answer"
          placeholder="Type your answer…"
          onChange={(event) => setAnswer(event.target.value)}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === "Enter") {
              event.preventDefault();
              submit();
            }
          }}
          className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground/70 disabled:cursor-not-allowed"
        />
      </div>
    </Card>
  );
}

export function HumanInTheLoopApprovalCard({
  requestKind,
  question,
  reason,
  title,
  context,
  options,
  recommendation,
  toolCalls,
  pending,
  isLoading,
  onDecision,
}: HumanInTheLoopApprovalCardProps) {
  if (requestKind !== HumanInTheLoopRequestKind.ASK_USER) {
    return (
      <ApprovalCard toolCalls={toolCalls ?? []} pending={pending} isLoading={isLoading} onDecision={onDecision} />
    );
  }

  if (options && options.length > 0) {
    return (
      <DecisionCard
        question={question}
        reason={reason}
        title={title}
        context={context}
        options={options}
        recommendation={recommendation}
        pending={pending}
        isLoading={isLoading}
        onDecision={onDecision}
      />
    );
  }

  return (
    <AskUserCard
      question={question}
      reason={reason}
      title={title}
      context={context}
      pending={pending}
      isLoading={isLoading}
      onDecision={onDecision}
    />
  );
}
