import test from "node:test";
import assert from "node:assert/strict";

import { normalizePdfDocument, extractImageUrls } from "@/lib/pdf/normalize";
import { PdfLimits } from "@/lib/pdf/document";

function validInput() {
  return {
    title: "Quarterly Report",
    sections: [
      {
        heading: "Summary",
        blocks: [
          { type: "paragraph", text: "Revenue grew **12%** this quarter." },
          { type: "list", style: "numbered", items: ["One", { text: "Two", items: ["Two A"] }] },
          { type: "table", columns: ["Name", "Value"], rows: [["A", "1"], ["B", "2"]] },
        ],
      },
    ],
  };
}

test("normalizePdfDocument accepts a valid document", () => {
  const result = normalizePdfDocument(validInput());
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.document.title, "Quarterly Report");
    assert.equal(result.document.sections.length, 1);
    assert.equal(result.document.sections[0].blocks.length, 3);
  }
});

test("normalizePdfDocument requires a title", () => {
  const result = normalizePdfDocument({ sections: [{ blocks: ["x"] }] });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /title/i);
});

test("normalizePdfDocument requires at least one section", () => {
  const result = normalizePdfDocument({ title: "T", sections: [] });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /section/i);
});

test("normalizePdfDocument coerces string blocks and unknown block types to paragraphs", () => {
  const result = normalizePdfDocument({
    title: "T",
    sections: [
      { blocks: ["plain string", { type: "mystery", text: "kept as paragraph" }, 42, null] },
    ],
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    const types = result.document.sections[0].blocks.map((b) => b.type);
    assert.deepEqual(types, ["paragraph", "paragraph", "paragraph"]);
  }
});

test("normalizePdfDocument drops empty sections and rejects documents with no usable content", () => {
  const result = normalizePdfDocument({ title: "T", sections: [{ blocks: [null, {}, ""] }] });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /usable content/i);
});

test("normalizePdfDocument enforces the section limit", () => {
  const sections = Array.from({ length: PdfLimits.SECTIONS + 1 }, () => ({ blocks: ["x"] }));
  const result = normalizePdfDocument({ title: "T", sections });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /sections/i);
});

test("normalizePdfDocument enforces the total text cap", () => {
  const result = normalizePdfDocument({
    title: "T",
    sections: [{ blocks: [{ type: "paragraph", text: "x".repeat(PdfLimits.TOTAL_TEXT_CHARS + 1) }] }],
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /character limit/i);
});

test("normalizePdfDocument rejects unsafe image URLs", () => {
  const result = normalizePdfDocument({
    title: "T",
    sections: [{ blocks: [{ type: "image", url: "javascript:alert(1)" }] }],
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /image url/i);
});

test("normalizePdfDocument enforces the image limit", () => {
  const blocks = Array.from({ length: PdfLimits.IMAGES + 1 }, (_, i) => ({
    type: "image",
    url: `https://example.com/${i}.png`,
  }));
  const result = normalizePdfDocument({ title: "T", sections: [{ blocks }] });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /images/i);
});

test("normalizePdfDocument sanitizes special characters in title and text", () => {
  const result = normalizePdfDocument({
    title: 'Report: <Q4> "2026" & 😀 more\x00',
    sections: [{ blocks: [{ type: "paragraph", text: "line\u200Bwith\u200Dformat chars" }] }],
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.document.title, 'Report: <Q4> "2026" &  more');
    assert.equal(result.document.sections[0].blocks[0].type, "paragraph");
  }
});

test("normalizePdfDocument coerces table cells to strings and pads short rows", () => {
  const result = normalizePdfDocument({
    title: "T",
    sections: [
      { blocks: [{ type: "table", columns: ["A", "B", "C"], rows: [[1, true], ["x", "y", "z", "extra"]] }] },
    ],
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    const table = result.document.sections[0].blocks[0];
    assert.equal(table.type, "table");
    if (table.type === "table") {
      assert.deepEqual(table.rows[0], ["1", "true", ""]);
      assert.deepEqual(table.rows[1], ["x", "y", "z"]);
    }
  }
});

test("normalizePdfDocument rejects oversized tables with a clear error", () => {
  const rows = Array.from({ length: PdfLimits.TABLE_ROWS + 20 }, (_, i) => [`r${i}`]);
  const result = normalizePdfDocument({
    title: "T",
    sections: [{ blocks: [{ type: "table", columns: ["C"], rows }] }],
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /rows/);
});

test("normalizePdfDocument rejects list nesting beyond the depth limit", () => {
  const result = normalizePdfDocument({
    title: "T",
    sections: [
      { blocks: [{ type: "list", items: [{ text: "a", items: [{ text: "b", items: [{ text: "c", items: [{ text: "too deep" }] }] }] }] }] },
    ],
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /nesting/i);
});

test("normalizePdfDocument rejects invalid accent values through schema validation", () => {
  const result = normalizePdfDocument({
    title: "T",
    accent: "neon",
    sections: [{ blocks: ["x"] }],
  });
  assert.equal(result.ok, false);
});

test("extractImageUrls dedupes image URLs", () => {
  const result = normalizePdfDocument({
    title: "T",
    sections: [
      { blocks: [{ type: "image", url: "https://example.com/a.png" }] },
      { blocks: [{ type: "image", url: "https://example.com/a.png" }, { type: "image", url: "https://example.com/b.png" }] },
    ],
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(extractImageUrls(result.document), ["https://example.com/a.png", "https://example.com/b.png"]);
  }
});
