"use client";

import { cn } from "@/lib/utils";
import { type ComponentProps, memo } from "react";
import { Streamdown } from "streamdown";
import { YouTubeLink } from "./youtubeLink";

type ResponseProps = ComponentProps<typeof Streamdown>;

function extractYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function processYouTubeLinks(text: string): { text: string; links: Array<{ url: string; videoId: string; placeholder: string }> } {
  const youtubeLinks: Array<{ url: string; videoId: string; placeholder: string }> = [];
  
  const urlRegex = /(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})(?:[^\s]*)?/gi;
  
  const processed = text.replace(urlRegex, (match) => {
    const videoId = extractYouTubeId(match);
    if (videoId) {
      const placeholder = `__YOUTUBE_LINK_${youtubeLinks.length}__`;
      youtubeLinks.push({ url: match, videoId, placeholder });
      return placeholder;
    }
    return match;
  });
  
  return { text: processed, links: youtubeLinks };
}

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

const ResponseComponent = ({ className, children, ...props }: ResponseProps) => {
  let processedChildren = children;
  let youtubeLinks: Array<{ url: string; videoId: string; placeholder: string }> = [];

  if (typeof children === 'string') {
    const { text, links } = processYouTubeLinks(children);
    processedChildren = fixMathDelimiters(text);
    youtubeLinks = links;
  }
  
  const renderContent = () => {
    if (typeof processedChildren !== 'string' || youtubeLinks.length === 0) {
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
    }

    const contentSections: React.ReactNode[] = [];
    let lastIndex = 0;
    const currentText = processedChildren as string;

    youtubeLinks.forEach((link, index) => {
      const placeholderIndex = currentText.indexOf(link.placeholder, lastIndex);
      
      if (placeholderIndex !== -1) {
        if (placeholderIndex > lastIndex) {
          const textBefore = currentText.substring(lastIndex, placeholderIndex);
          contentSections.push(
            <Streamdown
              key={`text-${index}`}
              className={cn(
                "size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
                className
              )}
              {...props}
            >
              {textBefore}
            </Streamdown>
          );
        }
        
        contentSections.push(
          <div key={`youtube-${index}`} className="my-4">
            <YouTubeLink url={link.url} videoId={link.videoId} showThumbnail={true} />
          </div>
        );
        
        lastIndex = placeholderIndex + link.placeholder.length;
      }
    });

    if (lastIndex < currentText.length) {
      const textAfter = currentText.substring(lastIndex);
      contentSections.push(
        <Streamdown
          key="text-end"
          className={cn(
            "size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
            className
          )}
          {...props}
        >
          {textAfter}
        </Streamdown>
      );
    }

    return contentSections;
  };
  
  return renderContent();
};

ResponseComponent.displayName = "Response";

export const Response = memo(ResponseComponent);
