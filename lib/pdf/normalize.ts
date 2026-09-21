import {
  PdfBlockType,
  PdfCalloutVariant,
  PdfListStyle,
  type PdfCalloutVariantValue,
  PdfLimits,
  pdfDocumentSchema,
  type PdfBlock,
  type PdfDocument,
  type PdfListItem,
  type PdfSection,
} from "./document";
import { isSafeHttpUrl, sanitizePdfText } from "./text";

const CALLOUT_VARIANTS = new Set<string>(Object.values(PdfCalloutVariant));

export type NormalizePdfResult =
  | { ok: true; document: PdfDocument }
  | { ok: false; error: string };

type CoerceResult = { block: PdfBlock } | { error: string } | null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function clip(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

function overLimit(kind: string, limit: number): { error: string } {
  return { error: `${kind} exceeds the ${limit.toLocaleString()} character limit. Split it into smaller blocks.` };
}

function coerceBlock(raw: unknown): CoerceResult {
  if (typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean") {
    const text = sanitizePdfText(asText(raw));
    if (!text) return null;
    if (text.length > PdfLimits.PARAGRAPH_CHARS) return overLimit("A paragraph", PdfLimits.PARAGRAPH_CHARS);
    return { block: { type: PdfBlockType.PARAGRAPH, text } };
  }
  if (!isRecord(raw)) return null;

  const type = typeof raw.type === "string" ? raw.type : undefined;

  switch (type) {
    case PdfBlockType.PARAGRAPH: {
      const text = sanitizePdfText(asText(raw.text ?? raw.content));
      if (!text) return null;
      if (text.length > PdfLimits.PARAGRAPH_CHARS) return overLimit("A paragraph", PdfLimits.PARAGRAPH_CHARS);
      return { block: { type, text } };
    }
    case PdfBlockType.HEADING: {
      const text = sanitizePdfText(asText(raw.text));
      if (!text) return null;
      if (text.length > PdfLimits.HEADING_CHARS) return overLimit("A heading", PdfLimits.HEADING_CHARS);
      const level = raw.level === 2 || raw.level === 3 ? raw.level : 2;
      return { block: { type, text, level } };
    }
    case PdfBlockType.LIST: {
      if (Array.isArray(raw.items) && raw.items.length > PdfLimits.LIST_ITEMS) {
        return {
          error: `A list has ${raw.items.length} items; the limit is ${PdfLimits.LIST_ITEMS}. Split it into multiple lists.`,
        };
      }
      const items = coerceListItems(raw.items, 1);
      if (items.error) return { error: items.error };
      if (!items.list || items.list.length === 0) return null;
      return {
        block: {
          type,
          style: raw.style === PdfListStyle.NUMBERED ? PdfListStyle.NUMBERED : PdfListStyle.BULLET,
          items: items.list,
        },
      };
    }
    case PdfBlockType.TABLE: {
      const columns = Array.isArray(raw.columns)
        ? raw.columns.map((c) => clip(sanitizePdfText(asText(c)), 120)).filter(Boolean)
        : [];
      if (columns.length === 0) return null;
      if (columns.length > PdfLimits.TABLE_COLS) {
        return { error: `A table has ${columns.length} columns; the limit is ${PdfLimits.TABLE_COLS}.` };
      }
      const rawRows = Array.isArray(raw.rows)
        ? raw.rows.filter((r): r is unknown[] => Array.isArray(r))
        : [];
      if (rawRows.length > PdfLimits.TABLE_ROWS) {
        return {
          error: `A table has ${rawRows.length} rows; the limit is ${PdfLimits.TABLE_ROWS}. Split it into multiple tables.`,
        };
      }
      const rows: string[][] = [];
      for (const rawRow of rawRows) {
        const row = rawRow.map((cell) => sanitizePdfText(asText(cell)));
        if (row.some((cell) => cell.length > PdfLimits.TABLE_CELL_CHARS)) {
          return overLimit("A table cell", PdfLimits.TABLE_CELL_CHARS);
        }
        while (row.length < columns.length) row.push("");
        rows.push(row.slice(0, columns.length));
      }
      return { block: { type, columns, rows } };
    }
    case PdfBlockType.CODE: {
      const code = asText(raw.code ?? raw.text).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
      if (!code.trim()) return null;
      if (code.length > PdfLimits.CODE_CHARS) return overLimit("A code block", PdfLimits.CODE_CHARS);
      const language = sanitizePdfText(asText(raw.language));
      return {
        block: {
          type,
          code,
          ...(language ? { language: clip(language, 40) } : {}),
        },
      };
    }
    case PdfBlockType.QUOTE: {
      const text = sanitizePdfText(asText(raw.text));
      if (!text) return null;
      if (text.length > PdfLimits.QUOTE_CHARS) return overLimit("A quote", PdfLimits.QUOTE_CHARS);
      const attribution = sanitizePdfText(asText(raw.attribution));
      return {
        block: {
          type,
          text,
          ...(attribution ? { attribution: clip(attribution, 200) } : {}),
        },
      };
    }
    case PdfBlockType.CALLOUT: {
      const text = sanitizePdfText(asText(raw.text));
      if (!text) return null;
      if (text.length > PdfLimits.CALLOUT_CHARS) return overLimit("A callout", PdfLimits.CALLOUT_CHARS);
      const variant = CALLOUT_VARIANTS.has(raw.variant as PdfCalloutVariantValue)
        ? (raw.variant as PdfCalloutVariantValue)
        : PdfCalloutVariant.INFO;
      const title = sanitizePdfText(asText(raw.title));
      return {
        block: {
          type,
          variant,
          text,
          ...(title ? { title: clip(title, 140) } : {}),
        },
      };
    }
    case PdfBlockType.KEY_VALUES: {
      if (Array.isArray(raw.items) && raw.items.length > PdfLimits.KEY_VALUES) {
        return { error: `A key-values block has ${raw.items.length} entries; the limit is ${PdfLimits.KEY_VALUES}.` };
      }
      const items = Array.isArray(raw.items)
        ? raw.items
            .map((item) =>
              isRecord(item)
                ? {
                    label: clip(sanitizePdfText(asText(item.label ?? item.key)), 120),
                    value: clip(sanitizePdfText(asText(item.value)), PdfLimits.TABLE_CELL_CHARS),
                  }
                : null,
            )
            .filter((item): item is { label: string; value: string } => !!item && !!item.label)
        : [];
      if (items.length === 0) return null;
      return { block: { type, items } };
    }
    case PdfBlockType.IMAGE: {
      const url = asText(raw.url ?? raw.src).trim();
      if (!url) return null;
      const alt = sanitizePdfText(asText(raw.alt));
      const caption = sanitizePdfText(asText(raw.caption));
      return {
        block: {
          type,
          url: clip(url, PdfLimits.IMAGE_URL_CHARS),
          ...(alt ? { alt: clip(alt, 300) } : {}),
          ...(caption ? { caption: clip(caption, 300) } : {}),
        },
      };
    }
    case PdfBlockType.DIVIDER:
      return { block: { type } };
    default: {
      const text = sanitizePdfText(asText(raw.text ?? raw.content));
      if (!text) return null;
      if (text.length > PdfLimits.PARAGRAPH_CHARS) return overLimit("A paragraph", PdfLimits.PARAGRAPH_CHARS);
      return { block: { type: PdfBlockType.PARAGRAPH, text } };
    }
  }
}

function coerceListItems(
  raw: unknown,
  depth: number,
): { list?: PdfListItem[]; error?: string } {
  if (!Array.isArray(raw)) return {};
  if (depth > PdfLimits.LIST_DEPTH) {
    return { error: `List nesting exceeds ${PdfLimits.LIST_DEPTH} levels. Flatten the list structure.` };
  }
  const list: PdfListItem[] = [];
  for (const item of raw) {
    if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
      const text = sanitizePdfText(asText(item));
      if (text.length > PdfLimits.LIST_ITEM_CHARS) return overLimit("A list item", PdfLimits.LIST_ITEM_CHARS);
      if (text) list.push({ text });
      continue;
    }
    if (isRecord(item)) {
      const text = sanitizePdfText(asText(item.text));
      if (text.length > PdfLimits.LIST_ITEM_CHARS) return overLimit("A list item", PdfLimits.LIST_ITEM_CHARS);
      const children = coerceListItems(item.items, depth + 1);
      if (children.error) return children;
      if (!text && (!children.list || children.list.length === 0)) continue;
      list.push({
        ...(text ? { text } : {}),
        ...(children.list && children.list.length ? { items: children.list } : {}),
      });
    }
  }
  return { list };
}

function blockTextLength(block: PdfBlock): number {
  switch (block.type) {
    case PdfBlockType.PARAGRAPH:
    case PdfBlockType.HEADING:
    case PdfBlockType.QUOTE:
    case PdfBlockType.CALLOUT:
      return block.text.length;
    case PdfBlockType.CODE:
      return block.code.length;
    case PdfBlockType.LIST: {
      const walk = (items: PdfListItem[]): number =>
        items.reduce((acc, item) => acc + (item.text?.length ?? 0) + walk(item.items ?? []), 0);
      return walk(block.items);
    }
    case PdfBlockType.TABLE:
      return (
        block.columns.reduce((acc, c) => acc + c.length, 0) +
        block.rows.reduce((acc, row) => acc + row.reduce((a, c) => a + c.length, 0), 0)
      );
    case PdfBlockType.KEY_VALUES:
      return block.items.reduce((acc, item) => acc + item.label.length + item.value.length, 0);
    default:
      return 0;
  }
}

function collectImageUrls(sections: PdfSection[]): string[] {
  const urls: string[] = [];
  for (const section of sections) {
    for (const block of section.blocks) {
      if (block.type === PdfBlockType.IMAGE) urls.push(block.url);
    }
  }
  return urls;
}

export function normalizePdfDocument(raw: unknown): NormalizePdfResult {
  if (!isRecord(raw)) {
    return { ok: false, error: "Input must be an object with a title and sections." };
  }

  const title = sanitizePdfText(asText(raw.title));
  if (!title) {
    return { ok: false, error: "A non-empty `title` is required." };
  }

  const rawSections = Array.isArray(raw.sections) ? raw.sections : [];
  if (rawSections.length === 0) {
    return {
      ok: false,
      error: "Provide at least one section in `sections`, each with a `blocks` array of content blocks.",
    };
  }
  if (rawSections.length > PdfLimits.SECTIONS) {
    return { ok: false, error: `Too many sections (${rawSections.length}); the limit is ${PdfLimits.SECTIONS}.` };
  }

  const sections: PdfSection[] = [];
  let totalChars = 0;
  let imageCount = 0;

  for (let index = 0; index < rawSections.length; index += 1) {
    const rawSection = rawSections[index];
    const sectionRecord = isRecord(rawSection) ? rawSection : { blocks: [rawSection] };
    const heading = sanitizePdfText(asText(sectionRecord.heading));
    const rawBlocks = Array.isArray(sectionRecord.blocks)
      ? sectionRecord.blocks
      : Array.isArray(sectionRecord.content)
        ? sectionRecord.content
        : typeof sectionRecord.content === "string"
          ? [sectionRecord.content]
          : [];

    if (rawBlocks.length > PdfLimits.BLOCKS_PER_SECTION) {
      return {
        ok: false,
        error: `Section ${index + 1} has ${rawBlocks.length} blocks; the limit is ${PdfLimits.BLOCKS_PER_SECTION}. Split it into more sections.`,
      };
    }

    const blocks: PdfBlock[] = [];
    for (const rawBlock of rawBlocks) {
      const result = coerceBlock(rawBlock);
      if (!result) continue;
      if ("error" in result) {
        return { ok: false, error: `Section ${index + 1}: ${result.error}` };
      }
      const block = result.block;
      if (block.type === PdfBlockType.IMAGE) {
        imageCount += 1;
        if (imageCount > PdfLimits.IMAGES) {
          return { ok: false, error: `Too many images; the limit is ${PdfLimits.IMAGES} per document.` };
        }
        if (!isSafeHttpUrl(block.url)) {
          return {
            ok: false,
            error: `Image URL "${block.url.slice(0, 120)}" is not a valid http(s) URL. Only direct http(s) image links are supported.`,
          };
        }
      }
      totalChars += blockTextLength(block);
      if (totalChars > PdfLimits.TOTAL_TEXT_CHARS) {
        return {
          ok: false,
          error: `Document text exceeds the ${PdfLimits.TOTAL_TEXT_CHARS.toLocaleString()} character limit. Shorten the content and try again.`,
        };
      }
      blocks.push(block);
    }

    if (blocks.length > 0) {
      sections.push({
        ...(heading ? { heading: clip(heading, PdfLimits.HEADING_CHARS) } : {}),
        blocks,
      });
    }
  }

  if (sections.length === 0) {
    return {
      ok: false,
      error: "No usable content blocks found. Add paragraphs, lists, tables, or other blocks with text.",
    };
  }

  const subtitle = sanitizePdfText(asText(raw.subtitle));
  const author = sanitizePdfText(asText(raw.author));

  const candidate = {
    title: clip(title, PdfLimits.TITLE_CHARS),
    ...(subtitle ? { subtitle: clip(subtitle, PdfLimits.SUBTITLE_CHARS) } : {}),
    ...(author ? { author: clip(author, PdfLimits.AUTHOR_CHARS) } : {}),
    ...(typeof raw.accent === "string" ? { accent: raw.accent } : {}),
    sections,
  };

  const parsed = pdfDocumentSchema.safeParse(candidate);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path.join(".") || "input";
    return { ok: false, error: `Invalid document at \`${path}\`: ${issue?.message ?? "unknown error"}` };
  }

  return { ok: true, document: parsed.data };
}

export function extractImageUrls(document: PdfDocument): string[] {
  return [...new Set(collectImageUrls(document.sections))];
}
