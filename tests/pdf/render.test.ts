import test from "node:test";
import assert from "node:assert/strict";

// @ts-expect-error pdf-parse v1 has no type declarations
import pdf from "pdf-parse/lib/pdf-parse.js";

import { renderPdfDocument } from "@/lib/pdf/render";
import { normalizePdfDocument } from "@/lib/pdf/normalize";
import type { PdfDocument } from "@/lib/pdf/document";
import type { PdfImageAsset } from "@/lib/pdf/images";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const FIXED_DATE = new Date("2026-09-21T12:00:00Z");
const NO_IMAGES = new Map<string, PdfImageAsset>();

function buildDocument(input: unknown): PdfDocument {
  const result = normalizePdfDocument(input);
  assert.equal(result.ok, true, result.ok ? "" : result.error);
  return (result as { ok: true; document: PdfDocument }).document;
}

async function render(input: unknown, images = NO_IMAGES): Promise<Buffer> {
  return renderPdfDocument(buildDocument(input), { images, generatedAt: FIXED_DATE });
}

function assertValidPdf(buffer: Buffer) {
  assert.ok(buffer.length > 500, "PDF buffer suspiciously small");
  assert.equal(buffer.subarray(0, 5).toString("latin1"), "%PDF-");
}

test("renders a minimal one-page document", async () => {
  const buffer = await render({
    title: "Minimal",
    sections: [{ blocks: [{ type: "paragraph", text: "Hello world." }] }],
  });
  assertValidPdf(buffer);
  const parsed = await pdf(buffer);
  assert.equal(parsed.numpages, 1);
  assert.match(parsed.text, /Hello world\./);
  assert.match(parsed.text, /Minimal/);
});

test("watermark and page numbers appear on every page of a long document", async () => {
  const paragraphs = Array.from({ length: 80 }, (_, i) => ({
    type: "paragraph",
    text: `Paragraph ${i + 1}. `.padEnd(220, "Lorem ipsum dolor sit amet, consectetur adipiscing elit. "),
  }));
  const buffer = await render({ title: "LongDoc", sections: [{ blocks: paragraphs }] });
  assertValidPdf(buffer);
  const parsed = await pdf(buffer);
  assert.ok(parsed.numpages > 1, `expected multiple pages, got ${parsed.numpages}`);
  const compact = parsed.text.replace(/\s+/g, "");
  const watermarkCount = (compact.match(/agenticchat/gi) ?? []).length;
  assert.ok(
    watermarkCount >= parsed.numpages,
    `expected watermark on all ${parsed.numpages} pages, found ${watermarkCount}`,
  );
  assert.match(parsed.text, /Page 1 of \d+/);
});

test("renders Devanagari text without throwing", async () => {
  const buffer = await render({
    title: "हिन्दी दस्तावेज़",
    sections: [
      {
        heading: "परिचय",
        blocks: [
          { type: "paragraph", text: "नमस्ते, यह एक परीक्षण है। English and हिन्दी together." },
          { type: "list", items: ["पहला", "दूसरा"] },
        ],
      },
    ],
  });
  assertValidPdf(buffer);
});

test("renders every block type in one document", async () => {
  const buffer = await render({
    title: "All Blocks",
    subtitle: "Everything at once",
    author: "Test Author",
    accent: "indigo",
    sections: [
      {
        heading: "Section One",
        blocks: [
          { type: "paragraph", text: "Intro with **bold**, *italic*, `code`, and [a link](https://example.com)." },
          { type: "heading", text: "Sub heading", level: 3 },
          { type: "list", style: "numbered", items: ["First", { text: "Second", items: ["Nested A", "Nested B"] }] },
          { type: "table", columns: ["Col A", "Col B", "Col C"], rows: [["1", "2", "3"], ["4", "5", "6"]] },
          { type: "code", code: "const x = 1;\nconsole.log(x);", language: "ts" },
          { type: "quote", text: "Something wise.", attribution: "Someone" },
          { type: "callout", variant: "warning", title: "Watch out", text: "Careful here." },
          { type: "key_values", items: [{ label: "Status", value: "Green" }, { label: "Owner", value: "Team" }] },
          { type: "divider" },
          { type: "paragraph", text: "After divider." },
        ],
      },
    ],
  });
  assertValidPdf(buffer);
  const parsed = await pdf(buffer);
  assert.match(parsed.text, /Section One/);
  assert.match(parsed.text, /Something wise\./);
  assert.match(parsed.text, /After divider\./);
});

test("page-breaks a table taller than one page without losing rows", async () => {
  const rows = Array.from({ length: 95 }, (_, i) => [`Row ${i + 1}`, `Value ${i + 1}`, "x".repeat(40)]);
  const buffer = await render({
    title: "BigTable",
    sections: [{ blocks: [{ type: "table", columns: ["A", "B", "C"], rows }] }],
  });
  assertValidPdf(buffer);
  const parsed = await pdf(buffer);
  assert.ok(parsed.numpages > 1);
  assert.match(parsed.text, /Row 95/);
});

test("wraps very long code lines instead of overflowing", async () => {
  const longLine = "x".repeat(500);
  const buffer = await render({
    title: "Code",
    sections: [{ blocks: [{ type: "code", code: `${longLine}\nshort();`, language: "text" }] }],
  });
  assertValidPdf(buffer);
  const parsed = await pdf(buffer);
  assert.match(parsed.text, /short\(\)/);
});

test("renders an image placeholder when the image failed to load", async () => {
  const images = new Map<string, PdfImageAsset>([
    ["https://example.com/missing.png", { ok: false, reason: "HTTP 404" }],
  ]);
  const buffer = await render(
    {
      title: "Images",
      sections: [
        { blocks: [{ type: "image", url: "https://example.com/missing.png", alt: "A chart", caption: "Figure 1" }] },
      ],
    },
    images,
  );
  assertValidPdf(buffer);
  const parsed = await pdf(buffer);
  assert.match(parsed.text, /Image unavailable/);
  assert.match(parsed.text, /Figure 1/);
});

test("renders a fetched PNG image inline", async () => {
  const png = readFileSync(join(process.cwd(), "public", "logo.png"));
  const images = new Map<string, PdfImageAsset>([
    [
      "https://example.com/dot.png",
      { ok: true, dataUri: `data:image/png;base64,${png.toString("base64")}`, size: { width: 10, height: 10 } },
    ],
  ]);
  const buffer = await render(
    {
      title: "Dot",
      sections: [{ blocks: [{ type: "image", url: "https://example.com/dot.png", caption: "A dot" }] }],
    },
    images,
  );
  assertValidPdf(buffer);
});

test("handles special characters in title and content", async () => {
  const buffer = await render({
    title: 'Special <chars> & "quotes" — ünïcode €',
    sections: [{ blocks: [{ type: "paragraph", text: "Symbols: € £ ¥ © ® ™ — … “quotes” ‘single’" }] }],
  });
  assertValidPdf(buffer);
});

test("supports concurrent renders", async () => {
  const buffers = await Promise.all(
    ["One", "Two", "Three"].map((title) =>
      render({ title, sections: [{ blocks: [{ type: "paragraph", text: `Doc ${title}` }] }] }),
    ),
  );
  for (const buffer of buffers) assertValidPdf(buffer);
});

test("every font family degrades missing italic faces to upright instead of crashing", async () => {
  const buffer = await render({
    title: "Italic fallbacks",
    sections: [
      {
        blocks: [
          { type: "paragraph", text: "Latin *italic* and ***bold italic*** at every weight." },
          { type: "paragraph", text: "Hindi *नमस्ते जी* and ***बोल्ड italics*** mixed in." },
          { type: "paragraph", text: "Mono family via `*code styled*` and plain `code` runs." },
          { type: "quote", text: "*पूरा उद्धरण italic में* with *English italics*" },
          { type: "callout", variant: "warning", text: "***तुरंत कार्रवाई*** needed *now*" },
        ],
      },
    ],
  });
  assertValidPdf(buffer);
});
