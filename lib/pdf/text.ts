const DEVANAGARI_PATTERN = /[\u0900-\u097F]/;
const EMOJI_PATTERN = /\p{Extended_Pictographic}\uFE0F?/gu;
const CONTROL_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;
const FORMAT_PATTERN = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g;
const LONE_SURROGATE_PATTERN = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

export function sanitizePdfText(input: string): string {
  return input
    .normalize("NFC")
    .replace(LONE_SURROGATE_PATTERN, "")
    .replace(CONTROL_PATTERN, "")
    .replace(FORMAT_PATTERN, "")
    .replace(EMOJI_PATTERN, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export interface ScriptRun {
  text: string;
  devanagari: boolean;
}

export function splitScriptRuns(text: string): ScriptRun[] {
  const runs: ScriptRun[] = [];
  let current = "";
  let currentDevanagari = false;

  for (const char of text) {
    const devanagari = DEVANAGARI_PATTERN.test(char);
    if (current && devanagari !== currentDevanagari) {
      runs.push({ text: current, devanagari: currentDevanagari });
      current = "";
    }
    currentDevanagari = devanagari;
    current += char;
  }
  if (current) {
    runs.push({ text: current, devanagari: currentDevanagari });
  }
  return runs;
}

export interface InlineSegment {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  link?: string;
}

const INLINE_PATTERN =
  /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|`([^`\n]+)`|\*\*([^*\n]+)\*\*|\*([^*\n]+)\*/g;

export function parseInlineMarkdown(input: string): InlineSegment[] {
  const segments: InlineSegment[] = [];
  let lastIndex = 0;

  for (const match of input.matchAll(INLINE_PATTERN)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      segments.push({ text: input.slice(lastIndex, index) });
    }
    const [full, linkLabel, linkUrl, code, bold, italic] = match;
    void full;
    if (linkLabel !== undefined && linkUrl !== undefined) {
      segments.push({ text: linkLabel, link: linkUrl });
    } else if (code !== undefined) {
      segments.push({ text: code, code: true });
    } else if (bold !== undefined) {
      segments.push({ text: bold, bold: true });
    } else if (italic !== undefined) {
      segments.push({ text: italic, italic: true });
    }
    lastIndex = index + match[0].length;
  }

  if (lastIndex < input.length) {
    segments.push({ text: input.slice(lastIndex) });
  }
  return segments.filter((segment) => segment.text.length > 0);
}

export function isSafeHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}
