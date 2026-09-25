import type { ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeKatex from "rehype-katex";
import { MAX_MARKDOWN_RENDER_CHARS, REMARK_PLUGINS } from "./response/constants";
import { PlainTextWithLinks } from "./response/plainText";
import { shouldRenderMarkdownContent } from "@/lib/markdown/rendering";

interface InlineMarkdownProps {
  content: string;
  className?: string;
}

const inlineMarkdownComponents: Components = {
  p: ({ children }) => <>{children}</>,
  strong: ({ children }) => <strong className="font-semibold text-current">{children}</strong>,
  em: ({ children }) => <em className="italic text-current">{children}</em>,
  del: ({ children }) => <del className="text-current decoration-current/60">{children}</del>,
  a: ({ children, href }) => (
    <a
      href={href}
      className="font-medium text-sky-600 underline underline-offset-2 transition-colors hover:text-sky-500 dark:text-sky-400 dark:hover:text-sky-300"
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  ),
  code: ({ children, className }) => (
    <code className={`rounded bg-foreground/[0.06] px-1 py-0.5 font-mono text-[0.9em] ${className ?? ""}`}>
      {children}
    </code>
  ),
  br: () => <br />,
  h1: ({ children }) => <strong className="font-semibold text-current">{children}</strong>,
  h2: ({ children }) => <strong className="font-semibold text-current">{children}</strong>,
  h3: ({ children }) => <strong className="font-semibold text-current">{children}</strong>,
  h4: ({ children }) => <strong className="font-semibold text-current">{children}</strong>,
  h5: ({ children }) => <strong className="font-semibold text-current">{children}</strong>,
  h6: ({ children }) => <strong className="font-semibold text-current">{children}</strong>,
  ul: ({ children }) => <span>{children}</span>,
  ol: ({ children }) => <span>{children}</span>,
  li: ({ children }) => <span>{children}</span>,
  blockquote: ({ children }) => <span>{children}</span>,
  table: ({ children }) => <span>{children}</span>,
  thead: ({ children }) => <span>{children}</span>,
  tbody: ({ children }) => <span>{children}</span>,
  tr: ({ children }) => <span>{children}</span>,
  th: ({ children }) => <span>{children}</span>,
  td: ({ children }) => <span>{children}</span>,
  input: ({ checked }) => <span>{checked ? "☑" : "☐"}</span>,
  hr: () => null,
  pre: ({ children }) => <>{children as ReactNode}</>,
  img: ({ alt }) => <span>{alt ?? ""}</span>,
};

export function InlineMarkdown({ content, className = "" }: InlineMarkdownProps) {
  const safeContent = content.length > MAX_MARKDOWN_RENDER_CHARS
    ? content.slice(0, MAX_MARKDOWN_RENDER_CHARS)
    : content;

  if (!shouldRenderMarkdownContent(safeContent)) {
    return (
      <span className={`whitespace-pre-wrap break-words ${className}`}>
        <PlainTextWithLinks content={safeContent} />
      </span>
    );
  }

  return (
    <span className={`whitespace-pre-wrap break-words ${className}`}>
      <ReactMarkdown
        remarkPlugins={REMARK_PLUGINS}
        rehypePlugins={[rehypeKatex]}
        components={inlineMarkdownComponents}
      >
        {safeContent}
      </ReactMarkdown>
    </span>
  );
}
