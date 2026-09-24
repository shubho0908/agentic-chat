import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { MarkdownTable } from "@/components/ai-elements/response/markdownTable";
import { MarkdownTableCell } from "@/components/ai-elements/response/markdownTableCell";
import { MarkdownCodeBlock } from "@/components/ai-elements/response/markdownCodeBlock";
import { classifyTableCell } from "@/components/ai-elements/response/markdownTableUtils";
import {
  countCodeLines,
  normalizeCodeText,
  shouldCollapseCode,
  shouldShowCodeLineNumbers,
} from "@/components/ai-elements/response/markdownCodeBlockUtils";

// Deterministic PRNG (mulberry32) so the fuzz run reproduces exactly.
function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CELL_POOL = [
  "yes", "No", "TRUE", "false", "✓", "✗", "—", "n/a", "Partial", "x", "+1",
  "See line 12", "$100", "", "   ", "Available", "not included", "None",
  "Hello world", "12", "✅", "❌", "supported", "unsupported", "—",
  "Feature name with entregue capaç unicode ✓ — 你好 مرحبا",
  "A very long value ".repeat(40),
  "| pipe |", "`code`", "**bold**", "#hash", ">quote", "$$x^2$$",
];

const LANG_POOL = [
  "language-ts", "language-python", "language-js", "language-diff",
  "language-diff-python", "language-bash", undefined, "language-mermaid",
];

test("fuzz: 3000 tables classify + render without throw", () => {
  const rand = mulberry32(1337);
  const kinds = new Set(["check", "cross", "dash", "text"]);
  const started = Date.now();
  let rendered = 0;

  for (let i = 0; i < 3000; i++) {
    const cols = 1 + Math.floor(rand() * 8);
    const rows = Math.floor(rand() * 25);
    const cells: string[] = [];
    for (let c = 0; c < cols * (rows + 1); c++) {
      cells.push(CELL_POOL[Math.floor(rand() * CELL_POOL.length)] ?? "x");
    }
    for (const cell of cells) {
      assert.ok(kinds.has(classifyTableCell(cell)));
    }
    // Render every 15th table through the real components.
    if (i % 15 === 0) {
      const headCells = cells.slice(0, cols);
      const bodyCells = cells.slice(cols);
      const html = renderToStaticMarkup(
        createElement(
          MarkdownTable,
          null,
          createElement(
            "thead",
            null,
            createElement(
              "tr",
              null,
              ...headCells.map((h, idx) => createElement("th", { key: idx }, h)),
            ),
          ),
          createElement(
            "tbody",
            null,
            ...Array.from({ length: rows }, (_, r) =>
              createElement(
                "tr",
                { key: r },
                ...Array.from({ length: cols }, (_, c) =>
                  createElement(
                    MarkdownTableCell,
                    { key: c },
                    bodyCells[r * cols + c] ?? "",
                  ),
                ),
              ),
            ),
          ),
        ),
      );
      assert.match(html, /<table/);
      assert.ok(html.length < 500_000, "rendered table stays bounded");
      rendered++;
    }
  }
  assert.ok(rendered >= 150, `expected >=150 rendered tables, got ${rendered}`);
  assert.ok(Date.now() - started < 60_000, "fuzz completes within budget");
});

test("fuzz: 1000 code blocks normalize + render without throw", () => {
  const rand = mulberry32(4242);
  const snippets = [
    "const a = 1;",
    "a\r\nb\r\n", "+ added\n- removed\n context\n", "x".repeat(6000),
    Array.from({ length: 60 }, (_, i) => `line ${i + 1}`).join("\n"),
    "", "\n", "a\n\n", "print('hi')\n".repeat(200),
  ];
  let rendered = 0;
  for (let i = 0; i < 1000; i++) {
    const raw = snippets[Math.floor(rand() * snippets.length)] ?? "";
    const normalized = normalizeCodeText(raw);
    const lf = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    assert.equal(normalized, lf.endsWith("\n") ? lf.slice(0, -1) : lf);
    const lines = countCodeLines(normalized);
    assert.ok(lines >= 0 && lines <= raw.split("\n").length + 1);
    assert.equal(typeof shouldCollapseCode(lines, normalized.length), "boolean");
    assert.equal(typeof shouldShowCodeLineNumbers(lines), "boolean");
    if (i % 5 === 0) {
      const lang = LANG_POOL[Math.floor(rand() * LANG_POOL.length)];
      const html = renderToStaticMarkup(
        createElement(MarkdownCodeBlock, { className: lang }, normalized),
      );
      assert.match(html, /Copy code|Copied/);
      rendered++;
    }
  }
  assert.ok(rendered >= 150, `expected >=150 rendered blocks, got ${rendered}`);
});
