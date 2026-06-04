"use client";

import { memo } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import type { Options } from "react-markdown";
import { components } from "@/components/ai-elements/response/markdownComponents";
import { REMARK_PLUGINS } from "@/components/ai-elements/response/constants";

const REHYPE_PLUGINS: NonNullable<Options["rehypePlugins"]> = [
  rehypeKatex,
  rehypeHighlight,
];

export const MarkdownArtifact = memo(function MarkdownArtifact({ content }: { content: string }) {
  return (
    <div className="min-h-full bg-background px-4 py-5 sm:px-6">
      <article className="prose-edward mx-auto w-full max-w-4xl text-sm leading-6 text-foreground [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
        <ReactMarkdown
          remarkPlugins={REMARK_PLUGINS}
          rehypePlugins={REHYPE_PLUGINS}
          components={components}
        >
          {content}
        </ReactMarkdown>
      </article>
    </div>
  );
});
