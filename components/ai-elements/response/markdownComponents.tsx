import type { Components } from "react-markdown";
import { MarkdownCodeBlock } from "./markdownCodeBlock";
import { MarkdownTable } from "./markdownTable";
import { MarkdownTableCell } from "./markdownTableCell";
import { MermaidPreview } from "./mermaidPreview";
import { getTextFromChildren } from "./plainTextUtils";
import { isMermaidCodeBlock } from "@/lib/markdown/rendering";

function withoutMarkdownNode<Props extends { node?: unknown }>(props: Props): Omit<Props, "node"> {
  const { node, ...domProps } = props;
  void node;
  return domProps;
}

export const components: Components = {
  pre({ children }) {
    return <>{children}</>;
  },
  code({ className, children, ...props }) {
    const codeContent = getTextFromChildren(children).replace(/\n$/, "");
    const isBlock = codeContent.includes("\n");
    const isMermaidBlock = isMermaidCodeBlock(className);
    const domProps = withoutMarkdownNode(props);
    void domProps;

    if (isMermaidBlock) {
      return <MermaidPreview source={codeContent} />;
    }

    if (className || isBlock) {
      return (
        <MarkdownCodeBlock className={className}>
          {children}
        </MarkdownCodeBlock>
      );
    }

    return (
      <code
        className="rounded-md border border-border/50 bg-foreground/[0.04] px-1.5 py-0.5 text-[0.85em] font-mono text-foreground break-words dark:bg-foreground/[0.06]"
        {...domProps}
      >
        {children}
      </code>
    );
  },
  h1: ({ children, ...props }) => (
    <h1
      className="text-base sm:text-lg font-semibold text-foreground mt-4 sm:mt-5 mb-1.5 sm:mb-2"
      {...withoutMarkdownNode(props)}
    >
      {children}
    </h1>
  ),
  h2: ({ children, ...props }) => (
    <h2
      className="text-sm sm:text-base font-semibold text-foreground mt-3 sm:mt-4 mb-1 sm:mb-1.5"
      {...withoutMarkdownNode(props)}
    >
      {children}
    </h2>
  ),
  h3: ({ children, ...props }) => (
    <h3
      className="text-xs sm:text-sm font-semibold text-foreground mt-2.5 sm:mt-3 mb-0.5 sm:mb-1"
      {...withoutMarkdownNode(props)}
    >
      {children}
    </h3>
  ),
  h4: ({ children, ...props }) => (
    <h4
      className="text-xs sm:text-sm font-semibold text-foreground mt-2.5 sm:mt-3 mb-0.5 sm:mb-1"
      {...withoutMarkdownNode(props)}
    >
      {children}
    </h4>
  ),
  h5: ({ children, ...props }) => (
    <h5
      className="text-xs font-semibold text-foreground mt-2 sm:mt-2.5 mb-0.5"
      {...withoutMarkdownNode(props)}
    >
      {children}
    </h5>
  ),
  h6: ({ children, ...props }) => (
    <h6
      className="text-[11px] font-semibold uppercase text-muted-foreground mt-2 sm:mt-2.5 mb-0.5"
      {...withoutMarkdownNode(props)}
    >
      {children}
    </h6>
  ),
  p: ({ children, ...props }) => (
    <p className="mb-1.5 sm:mb-2 last:mb-0 leading-relaxed" {...withoutMarkdownNode(props)}>
      {children}
    </p>
  ),
  ul: ({ children, ...props }) => (
    <ul
      className="mb-1.5 sm:mb-2 pl-4 sm:pl-5 space-y-0.5 sm:space-y-1 list-disc marker:text-muted-foreground/50 dark:marker:text-muted-foreground/30"
      {...withoutMarkdownNode(props)}
    >
      {children}
    </ul>
  ),
  ol: ({ children, ...props }) => (
    <ol
      className="mb-1.5 sm:mb-2 pl-4 sm:pl-5 space-y-0.5 sm:space-y-1 list-decimal marker:text-muted-foreground/60 dark:marker:text-muted-foreground/40"
      {...withoutMarkdownNode(props)}
    >
      {children}
    </ol>
  ),
  li: ({ children, ...props }) => (
    <li className="leading-relaxed" {...withoutMarkdownNode(props)}>
      {children}
    </li>
  ),
  a: ({ children, href, ...props }) => (
    <a
      href={href}
      className="text-sky-600 dark:text-sky-500 hover:text-sky-500 dark:hover:text-sky-400 underline underline-offset-2 decoration-sky-500/30 transition-colors font-medium break-words"
      target="_blank"
      rel="noopener noreferrer"
      {...withoutMarkdownNode(props)}
    >
      {children}
    </a>
  ),
  blockquote: ({ children, ...props }) => (
    <blockquote
      className="border-l-2 border-sky-500/50 dark:border-sky-500/30 pl-3 sm:pl-4 my-1.5 sm:my-2 text-muted-foreground dark:text-muted-foreground/80 italic font-medium"
      {...withoutMarkdownNode(props)}
    >
      {children}
    </blockquote>
  ),
  table: ({ children }) => <MarkdownTable>{children}</MarkdownTable>,
  thead: ({ children, ...props }) => (
    <thead
      className="sticky top-0 z-10 border-b border-zinc-200/90 bg-zinc-100/95 backdrop-blur-sm dark:border-zinc-800/90 dark:bg-zinc-900/95"
      {...withoutMarkdownNode(props)}
    >
      {children}
    </thead>
  ),
  tr: ({ children, ...props }) => (
    <tr
      className="border-t border-zinc-200/50 transition-colors first:border-t-0 hover:bg-zinc-900/[0.03] dark:border-zinc-800/50 dark:hover:bg-white/[0.04]"
      {...withoutMarkdownNode(props)}
    >
      {children}
    </tr>
  ),
  th: ({ children, ...props }) => (
    <th
      className="min-w-[6rem] px-2.5 py-2 text-left text-[10px] font-semibold tracking-wider text-zinc-600 uppercase sm:min-w-[7rem] sm:px-3 sm:text-[11px] dark:text-zinc-400"
      {...withoutMarkdownNode(props)}
    >
      {children}
    </th>
  ),
  td: ({ children }) => <MarkdownTableCell>{children}</MarkdownTableCell>,
  input: ({ type, checked, ...props }) => (
    <input
      type={type}
      checked={checked}
      readOnly
      disabled
      className="mr-1.5 size-3 align-[-0.125em] accent-primary"
      {...withoutMarkdownNode(props)}
    />
  ),
  hr: (props) => <hr className="my-3 sm:my-4 border-border/30" {...withoutMarkdownNode(props)} />,
  strong: ({ children, ...props }) => (
    <strong className="font-semibold text-foreground" {...withoutMarkdownNode(props)}>
      {children}
    </strong>
  ),
  em: ({ children, ...props }) => (
    <em className="italic text-foreground/90" {...withoutMarkdownNode(props)}>
      {children}
    </em>
  ),
  del: ({ children, ...props }) => (
    <del className="text-muted-foreground decoration-muted-foreground/60" {...withoutMarkdownNode(props)}>
      {children}
    </del>
  ),
};
