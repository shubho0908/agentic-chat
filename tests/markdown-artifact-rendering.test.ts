import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { MarkdownArtifact } from "@/components/artifacts/MarkdownArtifact";

test("markdown artifacts render GFM, math, highlighted code, and Mermaid previews", () => {
  const markdown = [
    "# Artifact spec",
    "",
    "- [x] Preview task lists",
    "",
    "| Feature | Status |",
    "| --- | --- |",
    "| Mermaid | supported |",
    "",
    "The score is $x^2 + y^2$.",
    "",
    "```mermaid",
    "flowchart TD",
    "  A[Draft] --> B[Preview]",
    "```",
    "",
    "```ts",
    "const enabled: boolean = true;",
    "```",
  ].join("\n");

  const html = renderToStaticMarkup(
    createElement(MarkdownArtifact, { content: markdown }),
  );

  assert.match(html, /<table/);
  assert.match(html, /type="checkbox"/);
  assert.match(html, /class="katex"/);
  assert.match(html, /Mermaid diagram preview|Rendering diagram preview|mermaid/);
  assert.match(html, /hljs-/);
  assert.match(html, /const/);
  assert.doesNotMatch(html, /<pre><div class="group\/code/);
  assert.doesNotMatch(html, /node="\[object Object\]"/);
});
