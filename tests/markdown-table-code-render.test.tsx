import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { MarkdownTable } from "@/components/ai-elements/response/markdownTable";
import { MarkdownTableCell } from "@/components/ai-elements/response/markdownTableCell";
import { MarkdownCodeBlock } from "@/components/ai-elements/response/markdownCodeBlock";

test("MarkdownTable renders scroll shell with sticky header", () => {
  const html = renderToStaticMarkup(
    createElement(
      MarkdownTable,
      null,
      createElement(
        "thead",
        null,
        createElement("tr", null, createElement("th", null, "Feature")),
      ),
      createElement(
        "tbody",
        null,
        createElement(
          "tr",
          null,
          createElement(MarkdownTableCell, null, "yes"),
          createElement(MarkdownTableCell, null, "A very long value ".repeat(50)),
        ),
      ),
    ),
  );
  assert.match(html, /overflow-auto/);
  assert.match(html, /Yes: yes/);
  assert.match(html, /A very long value/);
});

test("MarkdownTableCell leaves real data alone", () => {
  const html = renderToStaticMarkup(createElement(MarkdownTableCell, null, "Partial"));
  assert.match(html, /Partial/);
  assert.doesNotMatch(html, /lucide-check/);
});

test("MarkdownTableCell preserves GFM column alignment", () => {
  const center = renderToStaticMarkup(
    createElement(MarkdownTableCell, { style: { textAlign: "center" } }, "b"),
  );
  assert.match(center, /text-align:center/);
  const right = renderToStaticMarkup(
    createElement(MarkdownTableCell, { style: { textAlign: "right" } }, "c"),
  );
  assert.match(right, /text-align:right/);
  const plain = renderToStaticMarkup(createElement(MarkdownTableCell, null, "a"));
  assert.doesNotMatch(plain, /text-align/);
});

test("MarkdownCodeBlock renders header, gutter, and code", () => {
  const html = renderToStaticMarkup(
    createElement(MarkdownCodeBlock, { className: "language-ts" }, "const a = 1;\nconst b = 2;"),
  );
  assert.match(html, /ts/);
  assert.match(html, /Copy code/);
  assert.match(html, /Read-only code block/);
  assert.match(html, /role="group"/);
  assert.match(html, /data-read-only="true"/);
  assert.match(html, /const a/);
});
