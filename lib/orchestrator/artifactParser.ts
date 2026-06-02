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

/**
 * Stateful streaming parser that detects <artifact> tags in LLM output chunks.
 * Returns arrays of either text chunks (to send as regular content) or artifact SSE events.
 */
export function createArtifactStreamParser() {
  let buffer = "";
  let insideArtifact = false;
  let currentId = "";
  let artifactCounter = 0;
  const streamId = createStreamId();

  function generateId(): string {
    return `artifact-${streamId}-${++artifactCounter}`;
  }

  /**
   * Process a text chunk from the LLM stream.
   * Returns an array of actions: { text: string } for regular content, { event: ArtifactSSE } for artifact events.
   */
  function push(chunk: string): Array<{ text: string } | { event: ArtifactSSE }> {
    buffer += chunk;
    const results: Array<{ text: string } | { event: ArtifactSSE }> = [];

    while (true) {
      if (!insideArtifact) {
        // Look for opening tag
        const openIdx = findOpenTag(buffer);

        if (openIdx === -1) {
          // No tag start — but keep a trailing partial if buffer ends with `<` or `<a` etc.
          const safeFlush = trailingPartialTagLength(buffer, [OPEN_TAG_PREFIX]);
          if (buffer.length - safeFlush > 0) {
            results.push({ text: buffer.slice(0, buffer.length - safeFlush) });
            buffer = buffer.slice(buffer.length - safeFlush);
          }
          break;
        }

        // Flush text before the tag
        if (openIdx > 0) {
          results.push({ text: buffer.slice(0, openIdx) });
          buffer = buffer.slice(openIdx);
        }

        // Find the closing `>` of the opening tag
        const tagEnd = buffer.search(CLOSE_BRACKET_RE);;
        if (tagEnd < 1) {
          // Incomplete opening tag — wait for more data
          break;
        }

        const fullOpenTag = buffer.slice(0, tagEnd + 1);
        const parsed = parseOpenTag(fullOpenTag);

        if (!parsed) {
          // Invalid artifact tag — emit as text and skip past it
          results.push({ text: fullOpenTag });
          buffer = buffer.slice(tagEnd + 1);
          continue;
        }

        // Valid artifact opening tag
        currentId = generateId();
        insideArtifact = true;
        buffer = buffer.slice(tagEnd + 1);

        // Strip one leading newline after opening tag.
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
        // Inside artifact — look for close tag
        const closeIdx = findCloseTag(buffer);

        if (closeIdx === -1) {
          // No close tag yet — flush content up to a possible partial close tag.
          const safeLen = buffer.length - trailingPartialTagLength(buffer, [CLOSE_TAG]);
          if (safeLen > 0) {
            results.push({
              event: {
                type: ArtifactEventType.CHUNK,
                artifactId: currentId,
                content: buffer.slice(0, safeLen),
              },
            });
            buffer = buffer.slice(safeLen);
          }
          break;
        }

        // Found close tag — emit remaining content and end event
        let content = buffer.slice(0, closeIdx);
        // Strip one trailing newline before close tag.
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

  /** Flush any remaining buffered content (call at stream end). */
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

/**
 * How many trailing characters could be the start of `<artifact` or `</artifact>`.
 * We hold them back so we don't emit partial tag text prematurely.
 */
function trailingPartialTagLength(text: string, candidates: string[]): number {
  const lowerText = text.toLowerCase();
  let maxHold = 0;

  for (const candidate of candidates) {
    for (let len = 1; len < candidate.length && len <= text.length; len++) {
      if (lowerText.endsWith(candidate.slice(0, len))) {
        maxHold = Math.max(maxHold, len);
      }
    }
  }

  return maxHold;
}

function findOpenTag(text: string): number {
  return text.toLowerCase().indexOf(OPEN_TAG_PREFIX);
}

function findCloseTag(text: string): number {
  return text.toLowerCase().indexOf(CLOSE_TAG);
}

function createStreamId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
