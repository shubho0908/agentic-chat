"use client";

import { memo, useMemo, useState, type ReactNode } from "react";
import { Check, ChevronDown, Copy, FileCode2, LockKeyhole, WrapText } from "lucide-react";
import { toast } from "sonner";

import {
  CODE_BLOCK_MAX_HEIGHT_PX,
  CODE_IDE_BLOCK_SHELL_CLASS,
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

/**
 * Premium code surface (original design): file header with language +
 * line-count, wrap toggle, collapse for long output, clipboard-clean
 * line-number gutter (select-none + aria-hidden, copied text comes from
 * the raw prop so numbers never pollute pastes), hljs spans preserved
 * untouched for highlighting (diff tint arrives via hljs-addition/deletion).
 * Bounded by MAX_MARKDOWN_RENDER_CHARS upstream + line-number cap here,
 * so worst-case DOM stays finite during streaming.
 */
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
    <div
      className={CODE_IDE_BLOCK_SHELL_CLASS}
      role="group"
      data-read-only="true"
      aria-label="Read-only code block"
    >
      <div className="flex h-10 items-center gap-2 bg-zinc-900/95 px-3">
        <div className="hidden items-center gap-1.5 sm:flex" aria-hidden="true">
          <span className="size-2 rounded-full bg-red-400/75" />
          <span className="size-2 rounded-full bg-amber-300/75" />
          <span className="size-2 rounded-full bg-emerald-400/75" />
        </div>
        <div className="ml-1 flex min-w-0 items-center gap-2 sm:ml-2">
          <FileCode2 aria-hidden="true" className="size-3.5 shrink-0 text-sky-300" />
          <span className="min-w-0 truncate font-mono text-[11px] font-medium text-zinc-200 lowercase">
            {languageLabel}
          </span>
        </div>
        <span className="hidden shrink-0 items-center gap-1 rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-[0.14em] text-zinc-500 min-[420px]:inline-flex">
          <LockKeyhole aria-hidden="true" className="size-2.5" /> Read only
        </span>
        {lines > 0 ? (
          <span className="hidden shrink-0 text-[10px] tabular-nums text-zinc-500 min-[400px]:block">
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
            className="grid size-7 place-items-center rounded-md text-zinc-500 transition-colors outline-none hover:bg-white/10 hover:text-zinc-100 focus-visible:ring-2 focus-visible:ring-zinc-500"
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
              className="grid size-7 place-items-center rounded-md text-zinc-500 transition-colors outline-none hover:bg-white/10 hover:text-zinc-100 focus-visible:ring-2 focus-visible:ring-zinc-500"
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
            className="grid size-7 place-items-center rounded-md text-zinc-500 transition-colors outline-none hover:bg-white/10 hover:text-zinc-100 focus-visible:ring-2 focus-visible:ring-zinc-500"
          >
            {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
          </button>
        </span>
      </div>

      <div
        className="relative overflow-auto border-t border-white/10 overscroll-contain"
        style={collapsed ? { maxHeight: CODE_BLOCK_MAX_HEIGHT_PX } : undefined}
      >
        <div className={`flex items-stretch ${wrapped ? "w-full min-w-0" : "min-w-max"}`}>
          {showLineNumbers ? (
            <div
              aria-hidden="true"
              className="sticky left-0 z-10 flex shrink-0 select-none flex-col border-r border-white/[0.06] bg-zinc-900 py-3 text-right font-mono text-[11px] leading-5 text-zinc-600 sm:text-[12px]"
            >
              {gutterNumbers.map((number) => (
                <span key={number} className="block w-12 shrink-0 px-3 tabular-nums">
                  {number}
                </span>
              ))}
            </div>
          ) : null}
          <pre
            className="m-0 min-w-0 flex-1 overflow-visible bg-transparent"
            contentEditable={false}
            spellCheck={false}
            tabIndex={-1}
          >
            <code
              className={`${className ?? ""} dark block bg-zinc-950/75 px-4 py-3 font-mono text-[12px] leading-5 text-zinc-100 sm:px-5 sm:text-[13px] ${wrapped ? "whitespace-pre-wrap break-words" : "whitespace-pre"}`}
            >
              {children}
            </code>
          </pre>
        </div>
        {collapsed ? (
          <div className="pointer-events-none sticky bottom-0 h-16 bg-gradient-to-t from-zinc-950 via-zinc-950/90 to-transparent" />
        ) : null}
      </div>

      {collapsible ? (
        <button
          type="button"
          onClick={handleToggleExpanded}
          aria-expanded={expanded}
          className="flex w-full items-center justify-center gap-1.5 border-t border-white/10 bg-zinc-900/95 px-3 py-2 text-[11px] font-medium text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-100"
        >
          <ChevronDown className={`size-3.5 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} />
          {expanded ? "Show less" : `Show all ${lines} lines`}
        </button>
      ) : null}
    </div>
  );
});
