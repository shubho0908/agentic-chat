import { ArtifactEventType, ArtifactType, type ArtifactTypeValue } from "@/types/artifact";

const OPEN_TAG_PREFIX = "<artifact";
const CLOSE_TAG = "</artifact>";
const CLOSE_BRACKET_RE = />/;

const VALID_TYPES = new Set<string>(Object.values(ArtifactType));

interface ParsedOpenTag {
  type: ArtifactTypeValue;
  title: string;
  language?: string;
}

function parseOpenTag(tag: string): ParsedOpenTag | null {
  if (!/^<artifact(?:\s|>)/i.test(tag)) return null;

  const attrs = parseAttributes(tag);
  const rawType = attrs.get("type") ?? "";
  if (!VALID_TYPES.has(rawType)) return null;

  return {
    type: rawType as ArtifactTypeValue,
    title: attrs.get("title")?.trim() || "Untitled",
    language: attrs.get("language")?.trim() || undefined,
  };
}

function parseAttributes(tag: string): Map<string, string> {
  const attrs = new Map<string, string>();
  const attrRegex = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let match: RegExpExecArray | null;

  while ((match = attrRegex.exec(tag)) !== null) {
    attrs.set(match[1].toLowerCase(), decodeAttributeValue(match[2] ?? match[3] ?? ""));
  }

  return attrs;
}

function decodeAttributeValue(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

export interface ArtifactSSE {
  type: string;
  artifactId: string;
  artifactType?: string;
  title?: string;
  language?: string;
  content?: string;
}

const OPEN_TAG_LOWER = OPEN_TAG_PREFIX.toLowerCase();
const CLOSE_TAG_LOWER = CLOSE_TAG.toLowerCase();

function indexOfOpenTag(text: string): number {
  return text.toLowerCase().indexOf(OPEN_TAG_LOWER);
}

function indexOfCloseTag(text: string): number {
  return text.toLowerCase().indexOf(CLOSE_TAG_LOWER);
}

function createStreamId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createArtifactStreamParser() {
  let buffer = "";
  let insideArtifact = false;
  let currentId = "";
  let artifactCounter = 0;
  const streamId = createStreamId();

  function generateId(): string {
    return `artifact-${streamId}-${++artifactCounter}`;
  }

  function holdPartialSuffix(text: string): number {
    let maxHold = 0;
    for (let len = 1; len <= text.length && len <= OPEN_TAG_PREFIX.length; len++) {
      if (OPEN_TAG_PREFIX.slice(0, len) === text.slice(text.length - len).toLowerCase()) {
        maxHold = len;
      }
    }
    for (let len = 1; len <= text.length && len <= CLOSE_TAG.length; len++) {
      if (CLOSE_TAG.slice(0, len) === text.slice(text.length - len).toLowerCase()) {
        maxHold = Math.max(maxHold, len);
      }
    }
    return maxHold;
  }

  function push(chunk: string): Array<{ text: string } | { event: ArtifactSSE }> {
    buffer += chunk;
    const results: Array<{ text: string } | { event: ArtifactSSE }> = [];

    while (true) {
      if (!insideArtifact) {
        const openIdx = indexOfOpenTag(buffer);

        if (openIdx === -1) {
          const hold = holdPartialSuffix(buffer);
          const flushLen = buffer.length - hold;
          if (flushLen > 0) {
            results.push({ text: buffer.slice(0, flushLen) });
            buffer = buffer.slice(flushLen);
          }
          break;
        }

        if (openIdx > 0) {
          results.push({ text: buffer.slice(0, openIdx) });
          buffer = buffer.slice(openIdx);
        }

        const tagEnd = buffer.search(CLOSE_BRACKET_RE);
        if (tagEnd < 1) break;

        const fullOpenTag = buffer.slice(0, tagEnd + 1);
        const parsed = parseOpenTag(fullOpenTag);

        if (!parsed) {
          results.push({ text: fullOpenTag });
          buffer = buffer.slice(tagEnd + 1);
          continue;
        }

        currentId = generateId();
        insideArtifact = true;
        buffer = buffer.slice(tagEnd + 1);

        if (buffer.startsWith("\r\n")) {
          buffer = buffer.slice(2);
        } else if (buffer.startsWith("\n")) {
          buffer = buffer.slice(1);
        }

        results.push({
          event: {
            type: ArtifactEventType.START,
            artifactId: currentId,
            artifactType: parsed.type,
            title: parsed.title,
            language: parsed.language,
          },
        });
      } else {
        const closeIdx = indexOfCloseTag(buffer);

        if (closeIdx === -1) {
          const hold = holdPartialSuffix(buffer);
          const flushLen = buffer.length - hold;
          if (flushLen > 0) {
            results.push({
              event: {
                type: ArtifactEventType.CHUNK,
                artifactId: currentId,
                content: buffer.slice(0, flushLen),
              },
            });
            buffer = buffer.slice(flushLen);
          }
          break;
        }

        let content = buffer.slice(0, closeIdx);
        if (content.endsWith("\r\n")) {
          content = content.slice(0, -2);
        } else if (content.endsWith("\n")) {
          content = content.slice(0, -1);
        }

        if (content) {
          results.push({
            event: {
              type: ArtifactEventType.CHUNK,
              artifactId: currentId,
              content,
            },
          });
        }

        results.push({
          event: {
            type: ArtifactEventType.END,
            artifactId: currentId,
          },
        });

        buffer = buffer.slice(closeIdx + CLOSE_TAG.length);
        insideArtifact = false;
        currentId = "";
      }
    }

    return results;
  }

  function flush(): Array<{ text: string } | { event: ArtifactSSE }> {
    const results: Array<{ text: string } | { event: ArtifactSSE }> = [];

    if (insideArtifact) {
      if (buffer) {
        results.push({
          event: { type: ArtifactEventType.CHUNK, artifactId: currentId, content: buffer },
        });
      }
      results.push({
        event: { type: ArtifactEventType.END, artifactId: currentId },
      });
    } else if (buffer) {
      results.push({ text: buffer });
    }

    buffer = "";
    insideArtifact = false;
    currentId = "";
    return results;
  }

  return { push, flush };
}
