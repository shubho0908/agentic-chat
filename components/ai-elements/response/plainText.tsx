import { Fragment, type ReactNode } from "react";
import {
  DEFAULT_CODE_LANGUAGE,
  TRAILING_PUNCTUATION_PATTERN,
  TYPEOF_OBJECT,
  TYPEOF_STRING,
  URL_PATTERN,
} from "./constants";

function isStringNode(node: unknown): node is string {
  return typeof node === TYPEOF_STRING;
}

function isObjectNode(
  node: unknown,
): node is { props?: { children?: React.ReactNode } } {
  return typeof node === TYPEOF_OBJECT && node !== null;
}

export function getTextFromChildren(nodes: ReactNode): string {
  if (!nodes) return "";
  if (isStringNode(nodes)) return nodes;
  if (Array.isArray(nodes)) return nodes.map(getTextFromChildren).join("");
  if (isObjectNode(nodes) && "props" in nodes && nodes.props?.children) {
    return getTextFromChildren(nodes.props.children);
  }
  return String(nodes);
}

export function normalizeLanguageLabel(languageClass: string | undefined): string {
  if (!languageClass) {
    return DEFAULT_CODE_LANGUAGE;
  }

  const match = /language-([\w-]+)/.exec(languageClass);
  if (!match?.[1]) {
    return DEFAULT_CODE_LANGUAGE;
  }

  return match[1].replace(/[-_]/g, " ");
}

function splitTrailingPunctuation(candidateUrl: string): {
  normalizedUrl: string;
  trailingText: string;
} {
  let normalizedUrl = candidateUrl;
  let trailingText = "";

  while (TRAILING_PUNCTUATION_PATTERN.test(normalizedUrl)) {
    const punctuationMatch = normalizedUrl.match(TRAILING_PUNCTUATION_PATTERN);
    if (!punctuationMatch?.[0]) {
      break;
    }
    const punctuation = punctuationMatch[0];
    normalizedUrl = normalizedUrl.slice(0, -punctuation.length);
    trailingText = `${punctuation}${trailingText}`;
  }

  while (normalizedUrl.endsWith(")")) {
    const openingParens = normalizedUrl.split("(").length - 1;
    const closingParens = normalizedUrl.split(")").length - 1;
    if (closingParens <= openingParens) {
      break;
    }
    normalizedUrl = normalizedUrl.slice(0, -1);
    trailingText = `)${trailingText}`;
  }

  return { normalizedUrl, trailingText };
}

function getHrefFromCandidateUrl(candidateUrl: string): string {
  if (/^https?:\/\//i.test(candidateUrl)) {
    return candidateUrl;
  }
  return `https://${candidateUrl}`;
}

function buildPlainTextWithLinksNodes(content: string): ReactNode[] {
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
      if (!normalizedUrl) {
        lineNodes.push(
          <Fragment key={`line-${lineIndex}-raw-${startIndex}`}>{matchedUrl}</Fragment>,
        );
        cursor = startIndex + matchedUrl.length;
        continue;
      }

      lineNodes.push(
        <a
          key={`line-${lineIndex}-link-${startIndex}`}
          href={getHrefFromCandidateUrl(normalizedUrl)}
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

export function PlainTextWithLinks({ content }: { content: string }) {
  return <>{buildPlainTextWithLinksNodes(content)}</>;
}
