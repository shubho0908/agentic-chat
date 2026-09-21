import { z } from "zod";

export const PdfAccent = {
  SLATE: "slate",
  INDIGO: "indigo",
  EMERALD: "emerald",
  AMBER: "amber",
  ROSE: "rose",
} as const;
export type PdfAccentValue = (typeof PdfAccent)[keyof typeof PdfAccent];

export const PdfBlockType = {
  PARAGRAPH: "paragraph",
  HEADING: "heading",
  LIST: "list",
  TABLE: "table",
  CODE: "code",
  QUOTE: "quote",
  CALLOUT: "callout",
  KEY_VALUES: "key_values",
  IMAGE: "image",
  DIVIDER: "divider",
} as const;

export const PdfLimits = {
  TITLE_CHARS: 200,
  SUBTITLE_CHARS: 300,
  AUTHOR_CHARS: 120,
  SECTIONS: 60,
  BLOCKS_PER_SECTION: 80,
  TOTAL_TEXT_CHARS: 150_000,
  PARAGRAPH_CHARS: 10_000,
  HEADING_CHARS: 300,
  LIST_ITEMS: 200,
  LIST_ITEM_CHARS: 2_000,
  LIST_DEPTH: 3,
  TABLE_ROWS: 100,
  TABLE_COLS: 8,
  TABLE_CELL_CHARS: 2_000,
  CODE_CHARS: 20_000,
  QUOTE_CHARS: 4_000,
  CALLOUT_CHARS: 2_000,
  KEY_VALUES: 60,
  IMAGES: 12,
  IMAGE_URL_CHARS: 2_048,
  IMAGE_BYTES: 5 * 1024 * 1024,
} as const;

const headingLevelSchema = z.union([z.literal(2), z.literal(3)]);

export interface PdfListItem {
  text?: string;
  items?: PdfListItem[];
}

const listItemSchema: z.ZodType<PdfListItem> = z.lazy(() =>
  z.object({
    text: z.string().optional(),
    items: z.array(listItemSchema).optional(),
  }),
);

export const pdfBlockSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal(PdfBlockType.PARAGRAPH),
    text: z.string(),
  }),
  z.object({
    type: z.literal(PdfBlockType.HEADING),
    text: z.string(),
    level: headingLevelSchema.optional(),
  }),
  z.object({
    type: z.literal(PdfBlockType.LIST),
    style: z.enum(["bullet", "numbered"]).optional(),
    items: z.array(listItemSchema),
  }),
  z.object({
    type: z.literal(PdfBlockType.TABLE),
    columns: z.array(z.string()),
    rows: z.array(z.array(z.string())),
  }),
  z.object({
    type: z.literal(PdfBlockType.CODE),
    code: z.string(),
    language: z.string().optional(),
  }),
  z.object({
    type: z.literal(PdfBlockType.QUOTE),
    text: z.string(),
    attribution: z.string().optional(),
  }),
  z.object({
    type: z.literal(PdfBlockType.CALLOUT),
    variant: z.enum(["info", "warning", "success", "danger"]).optional(),
    title: z.string().optional(),
    text: z.string(),
  }),
  z.object({
    type: z.literal(PdfBlockType.KEY_VALUES),
    items: z.array(z.object({ label: z.string(), value: z.string() })),
  }),
  z.object({
    type: z.literal(PdfBlockType.IMAGE),
    url: z.string(),
    alt: z.string().optional(),
    caption: z.string().optional(),
  }),
  z.object({
    type: z.literal(PdfBlockType.DIVIDER),
  }),
]);

export const pdfSectionSchema = z.object({
  heading: z.string().optional(),
  blocks: z.array(pdfBlockSchema),
});

export const pdfDocumentSchema = z.object({
  title: z.string().min(1),
  subtitle: z.string().optional(),
  author: z.string().optional(),
  accent: z
    .enum([
      PdfAccent.SLATE,
      PdfAccent.INDIGO,
      PdfAccent.EMERALD,
      PdfAccent.AMBER,
      PdfAccent.ROSE,
    ])
    .optional(),
  sections: z.array(pdfSectionSchema).min(1),
});

export type PdfBlock = z.infer<typeof pdfBlockSchema>;
export type PdfSection = z.infer<typeof pdfSectionSchema>;
export type PdfDocument = z.infer<typeof pdfDocumentSchema>;
