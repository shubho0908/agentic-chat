"use client";

import { cn } from "@/lib/utils";
import { type ComponentProps, memo } from "react";
import { Streamdown } from "streamdown";

type ResponseProps = ComponentProps<typeof Streamdown>;

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

export const Response = memo(
  ({ className, children, ...props }: ResponseProps) => {
    const processedChildren = typeof children === 'string' 
      ? fixMathDelimiters(children)
      : children;
    
    return (
      <Streamdown
        className={cn(
          "size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
          className
        )}
        {...props}
      >
        {processedChildren}
      </Streamdown>
    );
  },
  (prevProps, nextProps) => prevProps.children === nextProps.children
);

Response.displayName = "Response";
