"use client";

import { memo, useMemo, useState, type ReactNode } from "react";
import { Check, ChevronDown, Copy, FileCode2, WrapText } from "lucide-react";
import { toast } from "sonner";

import {
  CODE_BLOCK_MAX_HEIGHT_PX,
  CODE_BLOCK_SHELL_CLASS,
} from "./constants";
import {
  countCodeLines,
  normalizeCodeText,
  shouldCollapseCode,
  shouldShowCodeLineNumbers,
} from "./markdownCodeBlockUtils";
import { getTextFromChildren, normalizeLanguageLabel } from "./plainTextUtils";

interface MarkdownCodeBlockProps {
  className?: string;
  children?: ReactNode;
}

export const MarkdownCodeBlock = memo(function MarkdownCodeBlock({
  className,
  children,
}: MarkdownCodeBlockProps) {
  const codeContent = useMemo(
    () => normalizeCodeText(getTextFromChildren(children)),
    [children],
  );
  const languageLabel = normalizeLanguageLabel(className);
  const lines = useMemo(() => countCodeLines(codeContent), [codeContent]);
  const chars = codeContent.length;
  const collapsible = shouldCollapseCode(lines, chars);
  const showLineNumbers = shouldShowCodeLineNumbers(lines);

  const [expanded, setExpanded] = useState(false);
  const [wrapped, setWrapped] = useState(false);
  const [copied, setCopied] = useState(false);

  const gutterNumbers = useMemo(
    () => (showLineNumbers ? Array.from({ length: lines }, (_, i) => i + 1) : []),
    [showLineNumbers, lines],
  );

  const collapsed = collapsible && !expanded;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(codeContent);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
      toast.success("Code copied");
    } catch {
      toast.error("Failed to copy code");
    }
  };

  const handleToggleExpanded = () => setExpanded((value) => !value);
  const handleToggleWrap = () => setWrapped((value) => !value);

  return (
    <div className={CODE_BLOCK_SHELL_CLASS}>
      <div className="flex h-10 items-center gap-2 px-3">
        <FileCode2 aria-hidden="true" className="size-3.5 shrink-0 text-zinc-500 dark:text-zinc-400" />
        <span className="min-w-0 truncate font-mono text-[11px] text-zinc-600 lowercase dark:text-zinc-400">
          {languageLabel}
        </span>
        {lines > 0 ? (
          <span className="hidden shrink-0 text-[10px] tabular-nums text-zinc-400 min-[400px]:block dark:text-zinc-500">
            {lines} {lines === 1 ? "line" : "lines"}
          </span>
        ) : null}
        <span className="ml-auto inline-flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={handleToggleWrap}
            aria-pressed={wrapped}
            aria-label={wrapped ? "Disable line wrap" : "Enable line wrap"}
            title={wrapped ? "Disable wrap" : "Wrap lines"}
            className="grid size-7 place-items-center rounded-full text-zinc-500 transition-colors outline-none hover:bg-zinc-900/5 hover:text-zinc-900 focus-visible:ring-2 focus-visible:ring-zinc-400 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-100"
          >
            <WrapText className="size-3.5" />
          </button>
          {collapsible ? (
            <button
              type="button"
              onClick={handleToggleExpanded}
              aria-expanded={expanded}
              aria-label={expanded ? "Collapse code" : `Expand code (${lines} lines)`}
              title={expanded ? "Collapse" : "Expand"}
              className="grid size-7 place-items-center rounded-full text-zinc-500 transition-colors outline-none hover:bg-zinc-900/5 hover:text-zinc-900 focus-visible:ring-2 focus-visible:ring-zinc-400 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-100"
            >
              <ChevronDown
                className={`size-3.5 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
              />
            </button>
          ) : null}
          <button
            type="button"
            onClick={handleCopy}
            aria-label={copied ? "Copied" : "Copy code"}
            title={copied ? "Copied" : "Copy code"}
            className="grid size-7 place-items-center rounded-full text-zinc-500 transition-colors outline-none hover:bg-zinc-900/5 hover:text-zinc-900 focus-visible:ring-2 focus-visible:ring-zinc-400 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-100"
          >
            {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
          </button>
        </span>
      </div>

      <div
        className="relative overflow-auto border-t border-zinc-200/70 overscroll-contain dark:border-zinc-800/70"
        style={collapsed ? { maxHeight: CODE_BLOCK_MAX_HEIGHT_PX } : undefined}
      >
        <div className={`flex items-stretch ${wrapped ? "w-full min-w-0" : "min-w-max"}`}>
          {showLineNumbers ? (
            <div
              aria-hidden="true"
              className="sticky left-0 flex shrink-0 flex-col bg-zinc-100/60 py-3 text-right font-mono text-[12px] leading-5 text-zinc-400 select-none sm:text-[13px] dark:bg-zinc-900/60 dark:text-zinc-600"
            >
              {gutterNumbers.map((number) => (
                <span key={number} className="block w-11 shrink-0 pr-3 pl-2 tabular-nums">
                  {number}
                </span>
              ))}
            </div>
          ) : null}
          <pre className="m-0 min-w-0 flex-1 overflow-visible bg-transparent">
            <code
              className={`${className ?? ""} block px-3 py-3 font-mono text-[12px] leading-5 text-zinc-900 sm:px-4 sm:text-[13px] dark:text-zinc-100 ${wrapped ? "whitespace-pre-wrap break-words" : "whitespace-pre"}`}
            >
              {children}
            </code>
          </pre>
        </div>
        {collapsed ? (
          <div className="pointer-events-none sticky bottom-0 h-16 bg-gradient-to-t from-zinc-50 via-zinc-50/80 to-transparent dark:from-zinc-950 dark:via-zinc-950/80" />
        ) : null}
      </div>

      {collapsible ? (
        <button
          type="button"
          onClick={handleToggleExpanded}
          aria-expanded={expanded}
          className="flex w-full items-center justify-center gap-1.5 border-t border-zinc-200/70 px-3 py-2 text-[11px] font-medium text-zinc-600 transition-colors hover:bg-zinc-900/[0.03] hover:text-zinc-900 dark:border-zinc-800/70 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-zinc-100"
        >
          <ChevronDown className={`size-3.5 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} />
          {expanded ? "Show less" : `Show all ${lines} lines`}
        </button>
      ) : null}
    </div>
  );
});
