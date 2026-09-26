"use client";

import { memo } from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import { components } from "./response/markdownComponents";
import {
  COMPLETE_CODE_FENCE_PATTERN,
  MAX_MARKDOWN_RENDER_CHARS,
  REMARK_PLUGINS,
} from "./response/constants";
import { PlainTextWithLinks } from "./response/plainText";
import { shouldRenderMarkdownContent } from "@/lib/markdown/rendering";

interface ResponseProps {
  children: string;
  className?: string;
}

export const Response = memo(function Response({
  children,
  className = "",
}: ResponseProps) {
  const canParseMarkdown =
    children.length <= MAX_MARKDOWN_RENDER_CHARS && shouldRenderMarkdownContent(children);
  const hasCodeFences = canParseMarkdown && COMPLETE_CODE_FENCE_PATTERN.test(children);

  if (!canParseMarkdown) {
    return (
      <div className={`prose-edward leading-inherit text-foreground ${className}`}>
        <p className="m-0 whitespace-pre-wrap break-words">
          <PlainTextWithLinks content={children} />
        </p>
      </div>
    );
  }

  const rehypePlugins = hasCodeFences
    ? [rehypeKatex, rehypeHighlight]
    : [rehypeKatex];

  return (
    <div className={`prose-edward leading-inherit text-foreground ${className}`}>
      <ReactMarkdown
        remarkPlugins={REMARK_PLUGINS}
        rehypePlugins={rehypePlugins}
        components={components}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
});
