import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ExportSection } from "@/components/export/exportSection";

test("download format legend is a direct child of the fieldset", () => {
  const html = renderToStaticMarkup(createElement(ExportSection, { conversationId: "conv" }));
  assert.match(html, /<fieldset[^>]*>\s*<legend/);
});
