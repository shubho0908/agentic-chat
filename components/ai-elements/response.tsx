"use client";

import { cn } from "@/lib/utils";
import { type ComponentProps, memo } from "react";
import { Streamdown } from "streamdown";
import type { ParsedSearchResult } from "@/lib/tools/parsing";
import Link from "next/link";

type ResponseProps = ComponentProps<typeof Streamdown> & {
  sources?: ParsedSearchResult[];
};

function fixMathDelimiters(text: string): string {
  const codeBlocks: string[] = [];
  const inlineCode: string[] = [];
  
  let processed = text.replace(/```[\s\S]*?```/g, (match) => {
    const index = codeBlocks.push(match) - 1;
    return `__CODEBLOCK_${index}__`;
  });
  
  processed = processed.replace(/`[^`]+`/g, (match) => {
    const index = inlineCode.push(match) - 1;
    return `__INLINECODE_${index}__`;
  });
  
  processed = processed.replace(
    /(?<!\$)\$(?!\$)([^$\d][^$]*?)(?<!\$)\$(?!\$)/g,
    '$$$$$$1$$$$'
  );
  
  processed = processed.replace(/__INLINECODE_(\d+)__/g, (_, index) => {
    return inlineCode[parseInt(index)];
  });
  
  processed = processed.replace(/__CODEBLOCK_(\d+)__/g, (_, index) => {
    return codeBlocks[parseInt(index)];
  });
  
  return processed;
}

const ResponseComponent = ({ className, children, sources, ...props }: ResponseProps) => {
  const processedChildren = typeof children === 'string' 
    ? fixMathDelimiters(children)
    : children;
  
  return (
    <div className="space-y-4">
      <Streamdown
        className={cn(
          "size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
          className
        )}
        {...props}
      >
        {processedChildren}
      </Streamdown>
      
      {sources && sources.length > 0 && (
        <div className="mt-6 pt-4 border-t border-border/50">
          <div className="flex flex-wrap gap-x-4 gap-y-2 items-baseline">
            {sources.map((source, index) => (
              <div key={index} className="flex items-baseline gap-1.5">
                <span className="text-foreground/40 select-none">•</span>
                <Link
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline decoration-dotted underline-offset-2 inline-flex items-center gap-1"
                  title={source.title}
                >
                  <span className="truncate max-w-[200px]">{source.domain || source.title}</span>
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

ResponseComponent.displayName = "Response";

export const Response = memo(ResponseComponent);
