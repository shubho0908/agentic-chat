import { Children, createContext, isValidElement, use, type ComponentProps, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeKatex from "rehype-katex";
import { MAX_MARKDOWN_RENDER_CHARS, REMARK_PLUGINS } from "./response/constants";
import { PlainTextWithLinks } from "./response/plainText";
import { shouldRenderMarkdownContent } from "@/lib/markdown/rendering";
import { cn } from "@/lib/utils";

type InlineMarkdownLinkMode = "interactive" | "text";

const orderedListNumberContext = createContext<number | null>(null);

function withoutMarkdownNode<Props extends { node?: unknown }>(props: Props): Omit<Props, "node"> {
  const { node, ...domProps } = props;
  void node;
  return domProps;
}

interface InlineMarkdownProps {
  content: string;
  className?: string;
  linkMode?: InlineMarkdownLinkMode;
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
  // Native list elements are invalid inside the inline contexts this renderer supports.
  ul: ({ children, className, ...props }) => (
    <span
      {...withoutMarkdownNode(props)}
      role="list"
      className={cn(
        "my-1 block max-w-full space-y-0.5 pl-4 break-words list-disc marker:text-muted-foreground/50 dark:marker:text-muted-foreground/30",
        className,
      )}
    >
      <orderedListNumberContext.Provider value={null}>
        {children}
      </orderedListNumberContext.Provider>
    </span>
  ),
  ol: ({ children, className, start, ...props }) => {
    const parsedStart = typeof start === "number" ? start : Number(start);
    const listStart = Number.isFinite(parsedStart) ? parsedStart : 1;
    const items = Children.toArray(children).filter(isValidElement);
    let nextItemNumber = listStart;

    return (
      <span
        {...withoutMarkdownNode(props)}
        role="list"
        aria-label={listStart === 1 ? undefined : `Ordered list starting at ${listStart}`}
        data-list-start={listStart}
        className={cn(
          "my-1 block max-w-full list-none space-y-0.5 pl-4 break-words marker:text-muted-foreground/50 dark:marker:text-muted-foreground/30",
          className,
        )}
      >
        {items.map((item) => {
          const itemNumber = nextItemNumber++;
          return (
            <orderedListNumberContext.Provider
              key={item.key ?? `item-${itemNumber}`}
              value={itemNumber}
            >
              {item}
            </orderedListNumberContext.Provider>
          );
        })}
      </span>
    );
  },
  li: InlineListItem,
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

const textOnlyMarkdownComponents: Components = {
  ...inlineMarkdownComponents,
  a: ({ children }) => <>{children}</>,
};

type InlineListItemProps = ComponentProps<"span"> & {
  node?: unknown;
};

function InlineListItem({ children, className, ...props }: InlineListItemProps) {
  const orderedNumber = use(orderedListNumberContext);
  const domProps = withoutMarkdownNode(props);

  return (
    <span
      {...domProps}
      role="listitem"
      className={cn("min-w-0 max-w-full list-item break-words", className)}
    >
      {orderedNumber === null ? null : (
        <span aria-hidden="true" className="mr-1 select-none">
          {orderedNumber}.
        </span>
      )}
      {children}
    </span>
  );
}

export function InlineMarkdown({
  content,
  className = "",
  linkMode = "interactive",
}: InlineMarkdownProps) {
  const canParseMarkdown =
    content.length <= MAX_MARKDOWN_RENDER_CHARS && shouldRenderMarkdownContent(content);

  if (!canParseMarkdown) {
    return (
      <span className={`whitespace-pre-wrap break-words ${className}`}>
        <PlainTextWithLinks content={content} interactiveLinks={linkMode === "interactive"} />
      </span>
    );
  }

  return (
    <span className={`whitespace-pre-wrap break-words ${className}`}>
      <ReactMarkdown
        remarkPlugins={REMARK_PLUGINS}
        rehypePlugins={[rehypeKatex]}
        components={linkMode === "interactive" ? inlineMarkdownComponents : textOnlyMarkdownComponents}
      >
        {content}
      </ReactMarkdown>
    </span>
  );
}
