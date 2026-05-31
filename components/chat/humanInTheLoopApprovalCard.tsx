"use client";

import { useState } from "react";
import { Check, X, Send, ShieldAlert, MessageCircleQuestion, GitFork, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HumanInTheLoopRequestKind } from "@/lib/tools/constants";
import { cn } from "@/lib/utils";

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

function formatToolName(name: string): string {
  return name
    .replace(/^(GMAIL|GOOGLECALENDAR|GOOGLEDRIVE|GOOGLEDOCS|GOOGLESHEETS|SLACK|NOTION|GITHUB|LINEAR|TODOIST)_/i, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function getToolkitFromName(name: string): string | null {
  const match = name.match(/^(GMAIL|GOOGLECALENDAR|GOOGLEDRIVE|GOOGLEDOCS|GOOGLESHEETS|SLACK|NOTION|GITHUB|LINEAR|TODOIST)_/i);
  if (!match) return null;
  const map: Record<string, string> = {
    gmail: "Gmail",
    googlecalendar: "Google Calendar",
    googledrive: "Google Drive",
    googledocs: "Google Docs",
    googlesheets: "Google Sheets",
    slack: "Slack",
    notion: "Notion",
    github: "GitHub",
    linear: "Linear",
    todoist: "Todoist",
  };
  return map[match[1].toLowerCase()] ?? match[1];
}

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

function ArgValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span className="text-muted-foreground/60 italic">empty</span>;
  if (typeof value === "boolean") return <span className="font-mono text-xs">{value ? "true" : "false"}</span>;
  if (typeof value === "number") return <span className="font-mono text-xs">{value}</span>;

  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-muted-foreground/60 italic">none</span>;
    return (
      <div className="flex flex-wrap gap-1">
        {value.map((item, i) => (
          <span key={i} className="inline-block rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
            {typeof item === "string" ? item : JSON.stringify(item)}
          </span>
        ))}
      </div>
    );
  }

  if (typeof value === "object") {
    return (
      <pre className="mt-1 max-h-32 overflow-auto rounded bg-muted/80 p-2 text-xs font-mono whitespace-pre-wrap break-words">
        {JSON.stringify(value, null, 2)}
      </pre>
    );
  }

  const str = String(value);
  if (isLongValue(str)) {
    return (
      <pre className="mt-1 max-h-40 overflow-auto rounded bg-muted/80 p-2 text-xs leading-relaxed whitespace-pre-wrap break-words">
        {str}
      </pre>
    );
  }

  return <span className="break-words">{str}</span>;
}

function ToolCallCard({ toolCall }: { toolCall: HumanInTheLoopToolCall }) {
  const toolkit = getToolkitFromName(toolCall.name);
  const actionName = formatToolName(toolCall.name);
  const args = toolCall.args ?? {};
  const argEntries = Object.entries(args).filter(([, v]) => v !== undefined && v !== null && v !== "");

  return (
    <div className="rounded-lg border border-border/50 bg-gradient-to-b from-card/90 to-muted/50 shadow-[0_1px_3px_rgba(0,0,0,0.05),inset_0_1px_0_rgba(255,255,255,0.06)] overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border/30 bg-muted/20 px-3 py-2">
        <ShieldAlert className="size-3.5 text-amber-500 shrink-0" />
        <div className="flex items-center gap-1.5 min-w-0">
          {toolkit && (
            <span className="text-[11px] font-medium text-muted-foreground bg-muted rounded px-1.5 py-0.5 shrink-0">
              {toolkit}
            </span>
          )}
          <span className="text-sm font-semibold text-foreground truncate">{actionName}</span>
        </div>
      </div>

      {argEntries.length > 0 && (
        <div className="divide-y divide-border/30">
          {argEntries.map(([key, value]) => (
            <div key={key} className="px-3 py-2">
              <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-0.5">
                {formatArgKey(key)}
              </div>
              <div className="text-sm text-foreground">
                <ArgValue value={value} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const OPTION_LETTERS = ["A", "B", "C", "D", "E", "F"];

function DecisionCard({
  title,
  context,
  options,
  recommendation,
  pending,
  isLoading,
  onDecision,
}: {
  title: string;
  context?: string;
  options: DecisionOption[];
  recommendation?: string;
  pending: boolean;
  isLoading: boolean;
  onDecision?: (approved: boolean, response?: string) => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);

  const recommendedIndex = (() => {
    if (!recommendation) return -1;
    const text = recommendation.trim();
    if (!text) return -1;

    const letterMatch = text.match(/^[\s(]*(?:option\s+)?([A-F])(?=[\s.:)\-,])/i);
    if (letterMatch) {
      const letterIdx = OPTION_LETTERS.indexOf(letterMatch[1].toUpperCase());
      if (letterIdx >= 0 && letterIdx < options.length) {
        return letterIdx;
      }
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

  return (
    <div className="rounded-xl border border-border/60 bg-gradient-to-b from-card to-muted/40 shadow-[0_2px_6px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.08)] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 bg-gradient-to-r from-amber-500/[0.06] to-transparent">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center size-7 rounded-lg bg-amber-500/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]">
            <GitFork className="size-4 text-amber-500" />
          </div>
          <span className="text-sm font-semibold text-foreground">{title}</span>
        </div>
        <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400 border border-amber-500/30 rounded-full px-2.5 py-0.5 bg-amber-500/[0.06]">
          Decision needed
        </span>
      </div>

      {context && (
        <div className="px-4 py-3 text-sm text-muted-foreground leading-relaxed border-b border-border/30">
          {context}
        </div>
      )}

      <div className="p-3 space-y-2">
        {options.map((option, i) => {
          const isRecommended = i === recommendedIndex;
          const isSelected = selected === i;

          return (
            <button
              key={`${option.label}:${option.description}`}
              type="button"
              disabled={!pending || isLoading}
              onClick={() => setSelected(i)}
              className={cn(
                "w-full text-left rounded-lg border p-3 transition-all shadow-[0_1px_2px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.06)]",
                isSelected
                  ? "border-blue-500/60 bg-blue-500/10 ring-1 ring-blue-500/30 shadow-[0_0_0_1px_rgba(59,130,246,0.2),inset_0_1px_0_rgba(255,255,255,0.08)]"
                  : isRecommended && selected === null
                    ? "border-blue-500/30 bg-blue-500/[0.04]"
                    : "border-border/50 bg-card/80 hover:border-border hover:bg-muted/30",
                (!pending || isLoading) && "opacity-60 cursor-not-allowed"
              )}
            >
              <div className="flex items-start gap-2.5">
                <span className={cn(
                  "flex items-center justify-center size-6 rounded-md text-xs font-bold shrink-0 mt-0.5",
                  isSelected
                    ? "bg-blue-500 text-white"
                    : "bg-muted text-muted-foreground"
                )}>
                  {OPTION_LETTERS[i]}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{option.label}</span>
                    {isRecommended && (
                      <Check className="size-3.5 text-blue-500" />
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    {option.description}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {recommendation && (
        <div className="flex items-start gap-2 px-4 py-2.5 border-t border-border/30 bg-muted/20">
          <Info className="size-3.5 text-muted-foreground mt-0.5 shrink-0" />
          <span className="text-xs text-muted-foreground leading-relaxed">
            Recommended: {recommendation}
          </span>
        </div>
      )}

      {pending && onDecision && (
        <div className="flex items-center gap-2 px-4 py-3 border-t border-border/40">
          <Button
            type="button"
            size="sm"
            disabled={isLoading || selected === null}
            onClick={() => {
              if (selected !== null) {
                onDecision(true, `${OPTION_LETTERS[selected]}. ${options[selected].label}`);
              }
            }}
            className="gap-1.5"
          >
            <Check className="size-3.5" />
            Confirm {selected !== null ? OPTION_LETTERS[selected] : ""}
          </Button>
        </div>
      )}
    </div>
  );
}

function AskUserCard({
  title,
  context,
  question,
  reason,
  pending,
  isLoading,
  onDecision,
}: {
  title?: string;
  context?: string;
  question?: string;
  reason?: string;
  pending: boolean;
  isLoading: boolean;
  onDecision?: (approved: boolean, response?: string) => void;
}) {
  const [answer, setAnswer] = useState("");

  return (
    <div className="rounded-xl border border-border/60 bg-gradient-to-b from-card to-muted/40 p-4 shadow-[0_2px_6px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.08)]">
      <div className="flex items-start gap-2.5">
        <div className="flex items-center justify-center size-6 rounded-md bg-blue-500/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] mt-0.5 shrink-0">
          <MessageCircleQuestion className="size-3.5 text-blue-500" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-foreground">
            {title || "Clarification needed"}
          </div>
          {context && (
            <div className="mt-1 text-sm text-muted-foreground leading-relaxed">{context}</div>
          )}
          <div className={cn("text-sm text-muted-foreground leading-relaxed", context ? "mt-1.5" : "mt-1")}>
            {question || "Can you clarify how to proceed?"}
          </div>
          {reason && (
            <div className="mt-1.5 text-xs text-muted-foreground/70 italic">{reason}</div>
          )}
        </div>
      </div>
      {pending && onDecision && (
        <div className="mt-3 flex gap-2">
          <input
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && answer.trim()) onDecision(true, answer.trim());
            }}
            disabled={isLoading}
            aria-label="Clarification answer"
            className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/50 transition-shadow"
            placeholder="Type your answer..."
          />
          <Button
            type="button"
            size="icon"
            disabled={isLoading || !answer.trim()}
            onClick={() => onDecision(true, answer.trim())}
            aria-label="Send answer"
          >
            <Send className="size-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

function ApprovalCard({
  toolCalls,
  question,
  reason,
  pending,
  isLoading,
  onDecision,
}: {
  toolCalls?: HumanInTheLoopToolCall[];
  question?: string;
  reason?: string;
  pending: boolean;
  isLoading: boolean;
  onDecision?: (approved: boolean, response?: string) => void;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-gradient-to-b from-card to-muted/40 shadow-[0_2px_6px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.08)] overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/40 bg-gradient-to-r from-amber-500/[0.06] to-transparent">
        <div className="flex items-center justify-center size-6 rounded-md bg-amber-500/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] shrink-0">
          <ShieldAlert className="size-3.5 text-amber-500" />
        </div>
        <span className="text-sm font-semibold text-foreground">Action requires approval</span>
      </div>

      {toolCalls && toolCalls.length > 0 && (
        <div className="p-3 space-y-2">
          {toolCalls.map((tc, i) => (
            <ToolCallCard key={tc.id ?? i} toolCall={tc} />
          ))}
        </div>
      )}

      {!toolCalls?.length && (question || reason) && (
        <div className="px-4 py-3 text-sm text-muted-foreground">
          {question || reason}
        </div>
      )}

      {pending && onDecision && (
        <div className={cn("flex items-center gap-2 px-4 py-3", toolCalls?.length && "border-t border-border/40")}>
          <Button
            type="button"
            size="sm"
            onClick={() => onDecision(true)}
            disabled={isLoading}
            className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <Check className="size-3.5" />
            Approve
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onDecision(false)}
            disabled={isLoading}
            className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10"
          >
            <X className="size-3.5" />
            Deny
          </Button>
        </div>
      )}
    </div>
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
  const isAskUser = requestKind === HumanInTheLoopRequestKind.ASK_USER;

  if (isAskUser && title && options && options.length > 0) {
    return (
      <DecisionCard
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

  if (isAskUser) {
    return (
      <AskUserCard
        title={title}
        context={context}
        question={question}
        reason={reason}
        pending={pending}
        isLoading={isLoading}
        onDecision={onDecision}
      />
    );
  }

  return (
    <ApprovalCard
      toolCalls={toolCalls}
      question={question}
      reason={reason}
      pending={pending}
      isLoading={isLoading}
      onDecision={onDecision}
    />
  );
}
