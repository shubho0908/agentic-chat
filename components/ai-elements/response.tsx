"use client";

import { cn } from "@/lib/utils";
import { type ComponentProps, memo } from "react";
import { Streamdown } from "streamdown";
import { YouTubeLink } from "./youtubeLink";
import { RichLink } from "./richLink";

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

const YOUTUBE_REGEX = /(?<!\]\()(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})(?:[^\s)]*)?/gi;
const URL_REGEX = /(?<![`\[]|(?:\]\())https?:\/\/[^\s<>\[\]`]+(?![`\]])/gi;
const IMAGE_EXTENSIONS = /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/i;

const isYouTubeUrl = (url: string) => /(?:youtube\.com|youtu\.be)/.test(url);
const isImageUrl = (url: string) => IMAGE_EXTENSIONS.test(url);

type ProcessedLink = 
  | { type: 'youtube'; url: string; videoId: string; placeholder: string }
  | { type: 'regular'; url: string; placeholder: string };

function isInsideMarkdownLink(text: string, matchIndex: number): boolean {
  const before = text.substring(Math.max(0, matchIndex - 100), matchIndex);
  const lastOpenParen = before.lastIndexOf('](');
  
  if (lastOpenParen === -1) return false;
  
  const after = text.substring(matchIndex, Math.min(text.length, matchIndex + 200));
  const firstCloseParen = after.indexOf(')');
  
  return firstCloseParen !== -1;
}

function processLinks(text: string): { text: string; links: ProcessedLink[] } {
  const links: ProcessedLink[] = [];
  
  let processed = text.replace(YOUTUBE_REGEX, (match, _videoId, offset) => {
    if (isInsideMarkdownLink(text, offset)) {
      return match;
    }
    
    const videoId = extractYouTubeId(match);
    if (!videoId) return match;
    
    const placeholder = `__LINK_${links.length}__`;
    links.push({ type: 'youtube', url: match, videoId, placeholder });
    return placeholder;
  });
  
  processed = processed.replace(URL_REGEX, (match, offset) => {
    if (match.startsWith('__LINK_') || isImageUrl(match) || isYouTubeUrl(match)) {
      return match;
    }
    
    if (isInsideMarkdownLink(processed, offset)) {
      return match;
    }
    
    const placeholder = `__LINK_${links.length}__`;
    links.push({ type: 'regular', url: match, placeholder });
    return placeholder;
  });
  
  return { text: processed, links };
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
  if (typeof children !== 'string') {
    return (
      <Streamdown
        className={cn("size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0", className)}
        {...props}
      >
        {children}
      </Streamdown>
    );
  }

  const { text: processedText, links } = processLinks(children);
  const finalText = fixMathDelimiters(processedText);

  if (links.length === 0) {
    return (
      <Streamdown
        className={cn("size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0", className)}
        {...props}
      >
        {finalText}
      </Streamdown>
    );
  }

  const sections: React.ReactNode[] = [];
  let lastIndex = 0;

  links
    .map((link) => ({ ...link, index: finalText.indexOf(link.placeholder) }))
    .filter(({ index }) => index !== -1)
    .sort((a, b) => a.index - b.index)
    .forEach((link, idx) => {
      if (link.index > lastIndex) {
        sections.push(
          <Streamdown
            key={`text-${idx}`}
            className={cn("size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0", className)}
            {...props}
          >
            {finalText.substring(lastIndex, link.index)}
          </Streamdown>
        );
      }

      sections.push(
        <div key={`link-${idx}`} className="my-4">
          {link.type === 'youtube' ? (
            <YouTubeLink url={link.url} videoId={link.videoId} showThumbnail={true} />
          ) : (
            <RichLink url={link.url} variant="compact" />
          )}
        </div>
      );

      lastIndex = link.index + link.placeholder.length;
    });

  if (lastIndex < finalText.length) {
    sections.push(
      <Streamdown
        key="text-end"
        className={cn("size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0", className)}
        {...props}
      >
        {finalText.substring(lastIndex)}
      </Streamdown>
    );
  }

  return <>{sections}</>;
};

ResponseComponent.displayName = "Response";

export const Response = memo(ResponseComponent);
