import { Fragment, type ReactNode } from "react";
import {
  getHrefFromCandidateUrl,
  splitTrailingPunctuation,
  URL_PATTERN,
} from "@/lib/url-normalization";

function buildPlainTextWithLinksNodes(content: string, interactiveLinks: boolean): ReactNode[] {
  const lines = content.split("\n");

  return lines.flatMap((line, lineIndex) => {
    const lineNodes: ReactNode[] = [];
    let cursor = 0;
    URL_PATTERN.lastIndex = 0;

    for (const match of line.matchAll(URL_PATTERN)) {
      const matchedUrl = match[0];
      const startIndex = match.index ?? -1;

      if (!matchedUrl || startIndex < cursor) {
        continue;
      }

      if (startIndex > cursor) {
        lineNodes.push(
          <Fragment key={`line-${lineIndex}-text-${cursor}`}>
            {line.slice(cursor, startIndex)}
          </Fragment>,
        );
      }

      const { normalizedUrl, trailingText } = splitTrailingPunctuation(matchedUrl);
      const href = normalizedUrl ? getHrefFromCandidateUrl(normalizedUrl) : null;
      if (!normalizedUrl || !href || !interactiveLinks) {
        lineNodes.push(
          <Fragment key={`line-${lineIndex}-raw-${startIndex}`}>{matchedUrl}</Fragment>,
        );
        cursor = startIndex + matchedUrl.length;
        continue;
      }

      lineNodes.push(
        <a
          key={`line-${lineIndex}-link-${startIndex}`}
          href={href}
          className="text-sky-600 dark:text-sky-500 hover:text-sky-500 dark:hover:text-sky-400 underline underline-offset-2 decoration-sky-500/35 transition-colors font-medium break-all"
          target="_blank"
          rel="noopener noreferrer"
        >
          {normalizedUrl}
        </a>,
      );

      if (trailingText) {
        lineNodes.push(
          <Fragment key={`line-${lineIndex}-punct-${startIndex}`}>
            {trailingText}
          </Fragment>,
        );
      }

      cursor = startIndex + matchedUrl.length;
    }

    if (cursor < line.length) {
      lineNodes.push(
        <Fragment key={`line-${lineIndex}-tail-${cursor}`}>{line.slice(cursor)}</Fragment>,
      );
    }

    if (lineIndex < lines.length - 1) {
      lineNodes.push(<br key={`line-${lineIndex}-break`} />);
    }

    return lineNodes;
  });
}

export function PlainTextWithLinks({
  content,
  interactiveLinks = true,
}: {
  content: string;
  interactiveLinks?: boolean;
}) {
  return <>{buildPlainTextWithLinksNodes(content, interactiveLinks)}</>;
}
