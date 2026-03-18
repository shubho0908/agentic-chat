import type { Components } from "react-markdown";
import { CodeCopyButton } from "./codeCopyButton";
import { CODE_BLOCK_SHELL_CLASS } from "./constants";
import { MermaidPreview } from "./mermaidPreview";
import { getTextFromChildren, normalizeLanguageLabel } from "./plainText";
import { isMermaidCodeBlock } from "@/lib/markdown/rendering";

export const components: Components = {
  code({ className, children, ...props }) {
    const codeContent = getTextFromChildren(children).replace(/\n$/, "");
    const isBlock = codeContent.includes("\n");
    const languageLabel = normalizeLanguageLabel(className);
    const isMermaidBlock = isMermaidCodeBlock(className);

    if (isMermaidBlock) {
      return <MermaidPreview source={codeContent} />;
    }

    if (className || isBlock) {
      return (
        <div className={CODE_BLOCK_SHELL_CLASS}>
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
