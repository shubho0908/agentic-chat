"use client";

import { memo, useMemo, type ReactNode } from "react";
import { FileCode2, LockKeyhole } from "lucide-react";
import { common, createLowlight } from "lowlight";

const lowlight = createLowlight(common);
const MAX_LINE_NUMBERS = 1_000;
const MAX_HIGHLIGHT_CHARS = 50_000;

const LANGUAGE_ALIASES: Record<string, string> = {
  react: "typescript",
  tsx: "typescript",
  jsx: "javascript",
  sh: "bash",
  zsh: "bash",
  yml: "yaml",
  md: "markdown",
  text: "plaintext",
};

function hastToJsx(nodes: readonly HastNode[], key = ""): ReactNode[] {
  return nodes.map((node, i) => {
    const nodeKey = key + i;
    if (node.type === "text") return node.value;
    if (node.type === "element") {
      const className = (node.properties?.className as string[] | undefined)?.join(" ");
      return (
        <span key={nodeKey} className={className || undefined}>
          {node.children ? hastToJsx(node.children, nodeKey + "-") : null}
        </span>
      );
    }
    return null;
  });
}

interface HastText { type: "text"; value: string }
interface HastElement { type: "element"; tagName: string; properties?: Record<string, unknown>; children?: HastNode[] }
type HastNode = HastText | HastElement;

function mapLanguage(language: string): string {
  const normalized = language.trim().toLowerCase();
  return LANGUAGE_ALIASES[normalized] ?? normalized;
}

function countLines(content: string): number {
  if (!content) return 0;

  const lastCode = content.charCodeAt(content.length - 1);
  const end = lastCode === 10
    ? content.charCodeAt(content.length - 2) === 13 ? content.length - 2 : content.length - 1
    : lastCode === 13 ? content.length - 1 : content.length;
  if (end === 0) return 0;

  let count = 1;
  for (let i = 0; i < end; i += 1) {
    const code = content.charCodeAt(i);
    if (code === 10) count += 1;
    else if (code === 13 && content.charCodeAt(i + 1) !== 10) count += 1;
  }
  return count;
}

function languageLabel(language: string): string {
  const normalized = language.trim().toLowerCase();
  return normalized || "plaintext";
}

interface CodeArtifactProps {
  content: string;
  language: string;
  isStreaming?: boolean;
}

export const CodeArtifact = memo(function CodeArtifact({ content, language, isStreaming = false }: CodeArtifactProps) {
  // Avoid repeatedly scanning a growing document on every streamed chunk.
  // The exact count and gutter are materialized only once streaming settles.
  const lineCount = useMemo(() => (isStreaming ? 0 : countLines(content)), [content, isStreaming]);
  const showLineNumbers = !isStreaming && lineCount > 0 && lineCount <= MAX_LINE_NUMBERS;
  const gutterNumbers = useMemo(
    () => (showLineNumbers ? Array.from({ length: lineCount }, (_, index) => index + 1) : []),
    [lineCount, showLineNumbers],
  );
  const highlighted = useMemo(() => {
    if (isStreaming || content.length > MAX_HIGHLIGHT_CHARS) return content;

    try {
      const lang = mapLanguage(language);
      return lowlight.registered(lang)
        ? hastToJsx(lowlight.highlight(lang, content).children as HastNode[])
        : content;
    } catch {
      return content;
    }
  }, [content, isStreaming, language]);

  return (
    <section
      className="flex h-full min-h-0 flex-col overflow-hidden bg-slate-50 text-slate-900 dark:bg-zinc-950 dark:text-zinc-100"
      data-read-only="true"
      aria-label="Read-only code viewer"
    >
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-slate-200 bg-slate-100 pl-3 pr-[52px] dark:border-white/10 dark:bg-zinc-900/95 lg:pr-[88px]">
        <div className="hidden items-center gap-1.5 sm:flex" aria-hidden="true">
          <span className="size-2 rounded-full bg-red-400/80" />
          <span className="size-2 rounded-full bg-amber-300/80" />
          <span className="size-2 rounded-full bg-emerald-400/80" />
        </div>
        <div className="ml-1 flex min-w-0 items-center gap-2 sm:ml-2">
          <FileCode2 aria-hidden="true" className="size-3.5 shrink-0 text-sky-700 dark:text-sky-300" />
          <span className="truncate font-mono text-[11px] font-medium text-slate-700 dark:text-zinc-200">
            {languageLabel(language)}
          </span>
        </div>
        <span className="hidden items-center gap-1 rounded border border-slate-200 bg-slate-200/60 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-[0.14em] text-slate-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-500 min-[420px]:inline-flex">
          Read only
        </span>
        <span className="ml-auto shrink-0 text-[10px] tabular-nums text-slate-600 dark:text-zinc-500">
          {isStreaming ? "Streaming…" : `${lineCount.toLocaleString("en-US")} ${lineCount === 1 ? "line" : "lines"}`}
        </span>
      </header>

      <section
        aria-label="Code content"
        className="relative min-h-0 flex-1 overflow-auto overscroll-contain"
        tabIndex={0}
      >
        <div className="flex min-h-full min-w-max items-stretch">
          {showLineNumbers ? (
            <div
              aria-hidden="true"
              className="sticky left-0 z-10 flex shrink-0 select-none flex-col border-r border-slate-200 bg-slate-100 py-3 text-right font-mono text-[11px] leading-5 text-slate-600 dark:border-white/[0.06] dark:bg-zinc-900 dark:text-zinc-600 sm:text-xs"
            >
              {gutterNumbers.map((number) => (
                <span key={number} className="block w-12 px-3 tabular-nums">
                  {number}
                </span>
              ))}
            </div>
          ) : null}
          <pre
            className="m-0 min-w-0 flex-1 overflow-visible bg-transparent px-4 py-3 text-slate-800 dark:text-zinc-200 sm:px-5"
            contentEditable={false}
          >
            <code className="hljs block whitespace-pre font-mono text-xs leading-5 sm:text-[13px]">
              {highlighted}
            </code>
          </pre>
        </div>
      </section>

      <footer className="flex h-7 shrink-0 items-center gap-2 border-t border-slate-200 bg-slate-100/80 px-3 text-[10px] text-slate-600 dark:border-white/[0.06] dark:bg-zinc-900/80 dark:text-zinc-600">
        <LockKeyhole aria-hidden="true" className="size-3" />
        <span>Source is read-only</span>
        <span className="ml-auto">UTF-8</span>
      </footer>
    </section>
  );
});
