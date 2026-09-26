export const URL_PATTERN = /\b((?:https?:\/\/|www\.)[^\s<>{}[\]"]+)/gi;
export const TRAILING_PUNCTUATION_PATTERN = /[.,!?;:]+$/;

export function splitTrailingPunctuation(candidateUrl: string): {
  normalizedUrl: string;
  trailingText: string;
} {
  let normalizedUrl = candidateUrl;
  let trailingText = "";

  while (TRAILING_PUNCTUATION_PATTERN.test(normalizedUrl)) {
    const punctuation = normalizedUrl.match(TRAILING_PUNCTUATION_PATTERN)?.[0];
    if (!punctuation) break;
    normalizedUrl = normalizedUrl.slice(0, -punctuation.length);
    trailingText = `${punctuation}${trailingText}`;
  }

  while (normalizedUrl.endsWith(")")) {
    const openingParens = normalizedUrl.split("(").length - 1;
    const closingParens = normalizedUrl.split(")").length - 1;
    if (closingParens <= openingParens) break;
    normalizedUrl = normalizedUrl.slice(0, -1);
    trailingText = `)${trailingText}`;
  }

  return { normalizedUrl, trailingText };
}

export function getHrefFromCandidateUrl(candidateUrl: string): string | null {
  const hasHttpScheme = /^https?:\/\//i.test(candidateUrl);
  const hasExplicitScheme = /^[a-z][a-z\d+.-]*:/i.test(candidateUrl);
  if (hasExplicitScheme && !hasHttpScheme) return null;

  const urlWithScheme = hasHttpScheme ? candidateUrl : `https://${candidateUrl}`;

  try {
    const parsedUrl = new URL(urlWithScheme);
    if (
      !parsedUrl.hostname ||
      (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:")
    ) {
      return null;
    }
    return parsedUrl.toString();
  } catch {
    return null;
  }
}

export function extractUrls(content: string): string[] {
  const urls = new Set<string>();
  URL_PATTERN.lastIndex = 0;

  for (const match of content.matchAll(URL_PATTERN)) {
    const { normalizedUrl } = splitTrailingPunctuation(match[0]);
    if (!normalizedUrl) continue;

    const href = getHrefFromCandidateUrl(normalizedUrl);
    if (href) urls.add(href);
  }

  return Array.from(urls);
}
