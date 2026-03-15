"use client";

import { Fragment, memo, useEffect, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import type { Components, Options } from "react-markdown";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface ResponseProps {
  children: string;
  className?: string;
}

const MAX_MARKDOWN_RENDER_CHARS = 50_000;
const MARKDOWN_SYNTAX_PATTERN =
  /(^|\n)\s{0,3}(#{1,6}\s|[-*+]\s|\d+\.\s|>\s)|\*\*|__|~~|`|\[[^\]]*\]\([^)]*\)|\|/;
const COMPLETE_CODE_FENCE_PATTERN = /```[\s\S]*?```/;
const REMARK_PLUGINS: NonNullable<Options["remarkPlugins"]> = [remarkGfm];
const EMPTY_REHYPE_PLUGINS: [] = [];
const URL_PATTERN = /\b((?:https?:\/\/|www\.)[^\s<>{}[\]"]+)/gi;
const TRAILING_PUNCTUATION_PATTERN = /[.,!?;:]+$/;

const TYPEOF_STRING = "string";
const TYPEOF_OBJECT = "object";
const DEFAULT_CODE_LANGUAGE = "code";

function isStringNode(node: unknown): node is string {
  return typeof node === TYPEOF_STRING;
}

function isObjectNode(
  node: unknown,
): node is { props?: { children?: React.ReactNode } } {
  return typeof node === TYPEOF_OBJECT && node !== null;
}

function getTextFromChildren(nodes: ReactNode): string {
  if (!nodes) return "";
  if (isStringNode(nodes)) return nodes;
  if (Array.isArray(nodes)) return nodes.map(getTextFromChildren).join("");
  if (isObjectNode(nodes) && "props" in nodes && nodes.props?.children) {
    return getTextFromChildren(nodes.props.children);
  }
  return String(nodes);
}

function normalizeLanguageLabel(languageClass: string | undefined): string {
  if (!languageClass) {
    return DEFAULT_CODE_LANGUAGE;
  }

  const match = /language-([\w-]+)/.exec(languageClass);
  if (!match?.[1]) {
    return DEFAULT_CODE_LANGUAGE;
  }

  return match[1].replace(/[-_]/g, " ");
}

function splitTrailingPunctuation(candidateUrl: string): {
  normalizedUrl: string;
  trailingText: string;
} {
  let normalizedUrl = candidateUrl;
  let trailingText = "";

  while (TRAILING_PUNCTUATION_PATTERN.test(normalizedUrl)) {
    const punctuationMatch = normalizedUrl.match(TRAILING_PUNCTUATION_PATTERN);
    if (!punctuationMatch?.[0]) {
      break;
    }
    const punctuation = punctuationMatch[0];
    normalizedUrl = normalizedUrl.slice(0, -punctuation.length);
    trailingText = `${punctuation}${trailingText}`;
  }

  while (normalizedUrl.endsWith(")")) {
    const openingParens = normalizedUrl.split("(").length - 1;
    const closingParens = normalizedUrl.split(")").length - 1;
    if (closingParens <= openingParens) {
      break;
    }
    normalizedUrl = normalizedUrl.slice(0, -1);
    trailingText = `)${trailingText}`;
  }

  return { normalizedUrl, trailingText };
}

function getHrefFromCandidateUrl(candidateUrl: string): string {
  if (/^https?:\/\//i.test(candidateUrl)) {
    return candidateUrl;
  }
  return `https://${candidateUrl}`;
}

function buildPlainTextWithLinksNodes(content: string): ReactNode[] {
  const lines = content.split("\n");

  return lines.flatMap((line, lineIndex) => {
    const lineNodes: ReactNode[] = [];
    let cursor = 0;
    URL_PATTERN.lastIndex = 0;

    for (const match of line.matchAll(URL_PATTERN)) {
      const matchedUrl = match[0];
      const startIndex = match.index ?? -1;

      if (!matchedUrl || startIndex < cursor) {
        continue;
      }

      if (startIndex > cursor) {
        lineNodes.push(
          <Fragment key={`line-${lineIndex}-text-${cursor}`}>
            {line.slice(cursor, startIndex)}
          </Fragment>,
        );
      }

      const { normalizedUrl, trailingText } = splitTrailingPunctuation(matchedUrl);
      if (!normalizedUrl) {
        lineNodes.push(
          <Fragment key={`line-${lineIndex}-raw-${startIndex}`}>{matchedUrl}</Fragment>,
        );
        cursor = startIndex + matchedUrl.length;
        continue;
      }

      lineNodes.push(
        <a
          key={`line-${lineIndex}-link-${startIndex}`}
          href={getHrefFromCandidateUrl(normalizedUrl)}
          className="text-sky-600 dark:text-sky-500 hover:text-sky-500 dark:hover:text-sky-400 underline underline-offset-2 decoration-sky-500/35 transition-colors font-medium break-all"
          target="_blank"
          rel="noopener noreferrer"
        >
          {normalizedUrl}
        </a>,
      );

      if (trailingText) {
        lineNodes.push(
          <Fragment key={`line-${lineIndex}-punct-${startIndex}`}>
            {trailingText}
          </Fragment>,
        );
      }

      cursor = startIndex + matchedUrl.length;
    }

    if (cursor < line.length) {
      lineNodes.push(
        <Fragment key={`line-${lineIndex}-tail-${cursor}`}>{line.slice(cursor)}</Fragment>,
      );
    }

    if (lineIndex < lines.length - 1) {
      lineNodes.push(<br key={`line-${lineIndex}-break`} />);
    }

    return lineNodes;
  });
}

function PlainTextWithLinks({ content }: { content: string }) {
  return <>{buildPlainTextWithLinksNodes(content)}</>;
}

function CodeCopyButton({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) {
      return;
    }

    const timeoutId = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timeoutId);
  }, [copied]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      toast.success("Code copied");
    } catch {
      toast.error("Failed to copy code");
    }
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={handleCopy}
      className="h-7 w-7 rounded-md border border-transparent p-0 text-zinc-500 hover:border-zinc-200 hover:bg-zinc-200/80 hover:text-zinc-800 dark:text-zinc-400 dark:hover:border-zinc-700 dark:hover:bg-zinc-800/80 dark:hover:text-zinc-100"
      aria-label={copied ? "Copied" : "Copy code"}
    >
      {copied ? <Check className="size-3.5 text-green-500" /> : <Copy className="size-3.5" />}
    </Button>
  );
}

const components: Components = {
  code({ className, children, ...props }) {
    const codeContent = getTextFromChildren(children).replace(/\n$/, "");
    const isBlock = codeContent.includes("\n");
    const languageLabel = normalizeLanguageLabel(className);

    if (className || isBlock) {
      return (
        <div className="group/code my-4 sm:my-5 w-full overflow-hidden rounded-xl border border-zinc-200/80 bg-zinc-50/65 text-zinc-900 shadow-sm shadow-zinc-950/5 dark:border-zinc-800/90 dark:bg-zinc-950/80 dark:text-zinc-100">
          <div className="flex items-center justify-between gap-3 border-b border-zinc-200/80 bg-zinc-100/70 px-3 py-2 sm:px-3.5 dark:border-zinc-800/80 dark:bg-zinc-900/70">
            <div className="min-w-0">
              <span className="block truncate text-[11px] font-medium lowercase tracking-wide text-zinc-600 dark:text-zinc-400">
                {languageLabel}
              </span>
            </div>
            <CodeCopyButton content={codeContent} />
          </div>

          <pre className="no-scrollbar max-w-full overflow-x-auto bg-transparent">
            <code
              className={`${className || ""} block min-w-max px-3 py-3 text-[12px] leading-5 font-mono text-zinc-900 sm:px-4 sm:py-3.5 sm:text-[13px] dark:text-zinc-100`}
              {...props}
            >
              {children}
            </code>
          </pre>
        </div>
      );
    }

    return (
      <code
        className="rounded-md border border-border/50 bg-foreground/[0.04] px-1.5 py-0.5 text-[0.85em] font-mono text-foreground break-words dark:bg-foreground/[0.06]"
        {...props}
      >
        {children}
      </code>
    );
  },
  h1: ({ children, ...props }) => (
    <h1
      className="text-base sm:text-lg font-semibold text-foreground mt-4 sm:mt-5 mb-1.5 sm:mb-2"
      {...props}
    >
      {children}
    </h1>
  ),
  h2: ({ children, ...props }) => (
    <h2
      className="text-sm sm:text-base font-semibold text-foreground mt-3 sm:mt-4 mb-1 sm:mb-1.5"
      {...props}
    >
      {children}
    </h2>
  ),
  h3: ({ children, ...props }) => (
    <h3
      className="text-xs sm:text-sm font-semibold text-foreground mt-2.5 sm:mt-3 mb-0.5 sm:mb-1"
      {...props}
    >
      {children}
    </h3>
  ),
  p: ({ children, ...props }) => (
    <p className="mb-1.5 sm:mb-2 last:mb-0 leading-relaxed" {...props}>
      {children}
    </p>
  ),
  ul: ({ children, ...props }) => (
    <ul
      className="mb-1.5 sm:mb-2 pl-4 sm:pl-5 space-y-0.5 sm:space-y-1 list-disc marker:text-muted-foreground/50 dark:marker:text-muted-foreground/30"
      {...props}
    >
      {children}
    </ul>
  ),
  ol: ({ children, ...props }) => (
    <ol
      className="mb-1.5 sm:mb-2 pl-4 sm:pl-5 space-y-0.5 sm:space-y-1 list-decimal marker:text-muted-foreground/60 dark:marker:text-muted-foreground/40"
      {...props}
    >
      {children}
    </ol>
  ),
  li: ({ children, ...props }) => (
    <li className="leading-relaxed" {...props}>
      {children}
    </li>
  ),
  a: ({ children, href, ...props }) => (
    <a
      href={href}
      className="text-sky-600 dark:text-sky-500 hover:text-sky-500 dark:hover:text-sky-400 underline underline-offset-2 decoration-sky-500/30 transition-colors font-medium break-words"
      target="_blank"
      rel="noopener noreferrer"
      {...props}
    >
      {children}
    </a>
  ),
  blockquote: ({ children, ...props }) => (
    <blockquote
      className="border-l-2 border-sky-500/50 dark:border-sky-500/30 pl-3 sm:pl-4 my-1.5 sm:my-2 text-muted-foreground dark:text-muted-foreground/80 italic font-medium"
      {...props}
    >
      {children}
    </blockquote>
  ),
  table: ({ children, ...props }) => (
    <div className="my-2 sm:my-3 overflow-x-auto rounded-lg border border-border/40 -mx-1 sm:mx-0">
      <table className="w-full min-w-0 text-[11px] sm:text-sm" {...props}>
        {children}
      </table>
    </div>
  ),
  thead: ({ children, ...props }) => (
    <thead
      className="bg-foreground/[0.04] border-b border-border/30"
      {...props}
    >
      {children}
    </thead>
  ),
  th: ({ children, ...props }) => (
    <th
      className="px-2 sm:px-3 py-1.5 sm:py-2 text-left text-[10px] sm:text-xs font-semibold text-foreground/80 dark:text-muted-foreground/70 uppercase tracking-wider"
      {...props}
    >
      {children}
    </th>
  ),
  td: ({ children, ...props }) => (
    <td
      className="px-2 sm:px-3 py-1.5 sm:py-2 border-t border-border/20"
      {...props}
    >
      {children}
    </td>
  ),
  hr: (props) => <hr className="my-3 sm:my-4 border-border/30" {...props} />,
  strong: ({ children, ...props }) => (
    <strong className="font-semibold text-foreground" {...props}>
      {children}
    </strong>
  ),
};

export const Response = memo(function Response({
  children,
  className = "",
}: ResponseProps) {
  const safeContent = children.length > MAX_MARKDOWN_RENDER_CHARS
    ? children.slice(0, MAX_MARKDOWN_RENDER_CHARS)
    : children;

  const hasMarkdownSyntax = MARKDOWN_SYNTAX_PATTERN.test(safeContent);
  const hasCodeFences = COMPLETE_CODE_FENCE_PATTERN.test(safeContent);

  if (!hasMarkdownSyntax) {
    return (
      <div className={`prose-edward leading-inherit text-foreground ${className}`}>
        <p className="m-0 whitespace-pre-wrap break-words">
          <PlainTextWithLinks content={safeContent} />
        </p>
      </div>
    );
  }

  const rehypePlugins = hasCodeFences ? [rehypeHighlight] : EMPTY_REHYPE_PLUGINS;

  return (
    <div className={`prose-edward leading-inherit text-foreground ${className}`}>
      <ReactMarkdown
        remarkPlugins={REMARK_PLUGINS}
        rehypePlugins={rehypePlugins}
        components={components}
      >
        {safeContent}
      </ReactMarkdown>
    </div>
  );
});
