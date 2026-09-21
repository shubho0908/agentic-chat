const ALLOWED_LINK_PROTOCOLS: ReadonlySet<string> = new Set([
  "http:",
  "https:",
  "mailto:",
]);

const URL_SCHEME_PATTERN = /^[a-zA-Z][a-zA-Z\d+.-]*:/;
const CONTROL_AND_SPACE_PATTERN = /[\u0000-\u0020]+/g;

function stripUnsafeCharacters(url: string): string {
  return url.replace(CONTROL_AND_SPACE_PATTERN, "");
}

export function markdownUrlTransform(url: string): string {
  const cleaned = stripUnsafeCharacters(url);
  if (!URL_SCHEME_PATTERN.test(cleaned)) {
    return url;
  }
  try {
    return ALLOWED_LINK_PROTOCOLS.has(new URL(cleaned).protocol) ? url : "";
  } catch {
    return "";
  }
}

export function isSafeMarkdownImageSrc(src: string | undefined): src is string {
  if (!src) {
    return false;
  }
  const cleaned = stripUnsafeCharacters(src);
  if (cleaned.startsWith("/") && !cleaned.startsWith("//")) {
    return true;
  }
  try {
    return new URL(cleaned).protocol === "https:";
  } catch {
    return false;
  }
}
